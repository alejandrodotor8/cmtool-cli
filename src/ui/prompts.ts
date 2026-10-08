/**
 * Preguntas al usuario (con @clack/prompts). Cada función devuelve la respuesta; no lee ni
 * escribe en Contentful. Esc vuelve al paso anterior (si hay uno) y Ctrl+C sale.
 */
import * as p from '@clack/prompts';
import pc from 'picocolors';
import type { BackupFile } from '../backup.ts';
import { COMMANDS, type Command } from '../cli-args.ts';
import type { ContentType, Environment, Space } from '../contentful/types.ts';
import { looksLikeProduction, sortEnvironments } from '../core/environments.ts';
import { parseIds } from '../core/ids.ts';
import { allPicks, type ModelOption, type ModelPick } from '../core/model-changes.ts';
import type { UpdateCandidate } from '../core/plan.ts';
import { parseSince } from '../core/query.ts';
import { AbortError, BackError, CancelError } from '../errors.ts';
import { log } from './log.ts';
import { beforePrompt, cancelledWithEscape, canGoBack, goBack, notePrompt, steps } from './navigation.ts';
import { clip } from './table.ts';
import { BACKUP_KIND_LABEL, changedFieldsText, modelPicksSummary, modelPickText } from './text.ts';

/**
 * Hace una pregunta y devuelve la respuesta. Si se cancela con Esc y hay un paso anterior,
 * lanza BackError (vuelve); si no, CancelError (sale).
 */
async function ask<T>(prompt: () => Promise<T>): Promise<Exclude<T, symbol>> {
  beforePrompt();
  const value = await prompt();
  if (p.isCancel(value)) throw cancelledWithEscape() && canGoBack() ? new BackError() : new CancelError();
  notePrompt();
  return value as Exclude<T, symbol>;
}

/** Opción "← Volver" de las listas (solo aparece si hay a dónde volver). */
const BACK = '\u0000volver';
const withBack = <T>(options: Choice<T>[]): p.Option<T>[] =>
  (canGoBack() ? [...options, { value: BACK as T, label: pc.dim('← Volver'), hint: 'Esc' }] : options) as p.Option<T>[];
const unlessBack = <T>(value: T): T => (value === BACK ? goBack() : value);

export interface Choice<T> {
  value: T;
  label: string;
  hint?: string;
}

// ───────────────────────── genéricas ─────────────────────────

/** Elegir una opción. */
export async function choose<T>(message: string, options: Choice<T>[], initialValue?: T): Promise<T> {
  return unlessBack(await ask(() => p.select<T>({ message, options: withBack(options), initialValue, maxItems: 12 })));
}

/** Elegir una opción escribiendo para filtrar (listas largas). */
export async function search<T>(message: string, options: Choice<T>[], initialValue?: T): Promise<T> {
  return unlessBack(
    await ask(() =>
      p.autocomplete<T>({
        message,
        placeholder: 'Escribe para filtrar…',
        options: withBack(options),
        initialValue,
        maxItems: 12,
      }),
    ),
  );
}

/** Marcar varias opciones (se puede escribir para filtrar). */
export function chooseMany<T>(
  message: string,
  options: Choice<T>[],
  { initialValues = [], required = true }: { initialValues?: T[]; required?: boolean } = {},
): Promise<T[]> {
  return ask(() =>
    p.autocompleteMultiselect<T>({
      message,
      placeholder: 'Escribe para filtrar · espacio marca · enter continúa · Esc vuelve',
      options: options as p.Option<T>[],
      initialValues,
      required,
      maxItems: 15,
    }),
  );
}

/** Texto de una línea. `validate` devuelve el mensaje de error, o nada si está bien. */
export async function askText(
  message: string,
  { placeholder, validate }: { placeholder?: string; validate?: (value: string) => string | undefined } = {},
): Promise<string> {
  const value = await ask(() => p.text({ message, placeholder, validate: (v) => validate?.((v ?? '').trim()) }));
  return value.trim();
}

/**
 * Aplicar todo, nada, o elegir: la primera opción siempre es todo, para no tener que
 * marcar uno por uno. "Elegir cuáles" solo aparece si hay más de una cosa.
 */
async function allOrSome<T>(
  message: string,
  items: T[],
  {
    all,
    none,
    pickSome,
  }: { all: Omit<Choice<string>, 'value'>; none: Omit<Choice<string>, 'value'>; pickSome: () => Promise<T[]> },
): Promise<T[]> {
  let mode = 'all';
  let picked: T[] = [];
  await steps([
    async () => {
      mode = await choose(message, [
        { value: 'all', ...all },
        ...(items.length > 1 ? [{ value: 'some', label: 'Elegir cuáles', hint: 'marcas uno por uno' }] : []),
        { value: 'none', ...none },
      ]);
    },
    async () => {
      picked = mode === 'all' ? items : mode === 'none' ? [] : await pickSome();
    },
  ]);
  return picked;
}

/** Sí / No. */
export function askYesNo(message: string, initialValue: boolean): Promise<boolean> {
  return ask(() => p.confirm({ message, active: 'Sí', inactive: 'No', initialValue }));
}

/** Ruta de un archivo existente (con autocompletado de rutas). */
export function askFile(message: string): Promise<string> {
  return ask(() => p.path({ message, directory: false }));
}

// ───────────────────────── específicas ─────────────────────────

export const pickCommand = (): Promise<Command> =>
  choose(
    '¿Qué quieres hacer?',
    (Object.entries(COMMANDS) as [Command, (typeof COMMANDS)[Command]][]).map(([value, c]) => ({
      value,
      label: c.label,
      hint: c.hint,
    })),
  );

export const pickSpace = (spaces: Space[], defaultId: string | undefined): Promise<string> =>
  search(
    'Space',
    spaces.map((s) => ({ value: s.sys.id, label: s.name, hint: s.sys.id })),
    spaces.some((s) => s.sys.id === defaultId) ? defaultId : undefined,
  );

/** Ambientes de prueba primero (develop, QA…) y producción al final; producción va marcada. */
const envChoices = (envs: Environment[]) =>
  sortEnvironments(envs).map((e) => ({
    value: e.id,
    label: looksLikeProduction(e) ? `${e.id} ${pc.yellow('· producción')}` : e.id,
    hint: e.aliases.length ? `alias: ${e.aliases.join(', ')}` : undefined,
  }));

/**
 * Ambiente de origen. Si parece producción, pide confirmarlo: lo normal es migrar desde
 * un ambiente de pruebas hacia producción. "No" vuelve a la lista.
 */
export async function pickSource(envs: Environment[]): Promise<string> {
  let src = '';
  await steps([
    async () => {
      src = await choose('Ambiente de ORIGEN', envChoices(envs));
    },
    async () => {
      const env = envs.find((e) => e.id === src);
      if (!env || !looksLikeProduction(env)) return;
      log.warn(
        `${pc.bold(src)} parece producción. Lo normal es migrar desde un ambiente de pruebas (develop, QA) hacia producción, no al revés.`,
      );
      if (!(await askYesNo(`¿Seguro que quieres usar ${pc.bold(src)} como ORIGEN?`, false))) goBack();
    },
  ]);
  return src;
}

export const pickDestination = (envs: Environment[], src: string): Promise<string> =>
  choose(
    `Ambiente de DESTINO ${pc.dim(`(origen: ${src})`)}`,
    envChoices(envs).filter((c) => c.value !== src),
  );

const contentTypeChoices = (cts: Iterable<ContentType>) =>
  [...cts]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((ct) => ({ value: ct.sys.id, label: ct.name, hint: ct.sys.id }));

export const pickContentType = (cts: Iterable<ContentType>, message = 'Content type'): Promise<string> =>
  search(message, contentTypeChoices(cts));

const KIND = {
  entries: { what: 'Entry IDs de Contentful', url: 'la URL de la entry' },
  assets: { what: 'Asset IDs de Contentful', url: 'la URL del asset' },
} as const;

/**
 * Pide IDs (o URLs copiadas del navegador). Acepta varias líneas: se puede pegar una columna
 * o fila de Excel. Enter agrega una línea; para continuar se usa Tab + Enter en [ submit ],
 * así una celda vacía en lo que pegas no envía la respuesta antes de tiempo.
 */
export async function askIds(kind: keyof typeof KIND = 'entries'): Promise<string[]> {
  const { what, url } = KIND[kind];
  const key = (k: string) => pc.bold(pc.cyan(k));
  log.block(
    [
      pc.dim(`Pega los IDs (o ${url}, copiada del navegador):`),
      pc.dim('uno por línea —puedes pegar una columna de Excel— o separados por coma.'),
      `${key('Enter')} ${pc.dim('nueva línea')}   ${key('Tab')} ${pc.dim('ir a [ submit ]')}   ${key('Enter')} ${pc.dim('en [ submit ] para continuar')}`,
    ].join('\n'),
    1,
  );
  const raw = await ask(() =>
    p.multiline({
      message: `${what} ${pc.dim('·')} ${pc.yellow('Tab + Enter para continuar')}`,
      placeholder: 'Pega aquí…',
      showSubmit: true,
      validate: (value) => {
        const { ids, invalid } = parseIds(value ?? '', kind);
        if (invalid.length) return `No es un ID ni ${url}: ${clip(invalid.join(', '), 60)}`;
        if (!ids.length) return 'Pega al menos un ID.';
        return undefined;
      },
    }),
  );
  const { ids } = parseIds(raw, kind);
  log.info(`${ids.length} ID(s): ${clip(ids.join(', '), 90)}`);
  return ids;
}

/** Desde cuándo (para "cambiadas recientemente"). Devuelve la fecha ISO. */
export async function askSince(): Promise<string> {
  let choice = '';
  let text = '';
  await steps([
    async () => {
      choice = await choose('¿Cambiadas desde cuándo?', [
        { value: 'hoy', label: 'Hoy' },
        { value: '7d', label: 'Últimos 7 días' },
        { value: '30d', label: 'Últimos 30 días' },
        { value: 'fecha', label: 'Desde una fecha…' },
      ]);
    },
    async () => {
      text =
        choice === 'fecha'
          ? await askText('Fecha', {
              placeholder: 'AAAA-MM-DD',
              validate: (v) => (parseSince(v) ? undefined : 'Usa el formato AAAA-MM-DD (por ejemplo 2026-10-01).'),
            })
          : choice;
    },
  ]);
  return parseSince(text) as string;
}

/**
 * Entries que ya existen en destino y cambiaron en origen: cuáles actualizar. Las que
 * eligió el usuario vienen marcadas; los hijos, no.
 */
export function askEntryUpdates(
  candidates: UpdateCandidate[],
  { titleOf, src, dst }: { titleOf: (id: string) => string; src: string; dst: string },
): Promise<string[]> {
  const option = (c: UpdateCandidate) => ({
    value: c.id,
    label: `${clip(titleOf(c.id), 40)} ${pc.dim(c.isRoot ? '· la elegiste' : '· hijo')}`,
    hint: changedFieldsText(c.fields),
  });
  const [only] = candidates;
  return allOrSome(
    `${candidates.length} entry(s) ya existen en ${pc.bold(dst)} y cambiaron en ${pc.bold(src)}: ¿actualizo?`,
    candidates.map((c) => c.id),
    {
      all:
        candidates.length === 1 && only
          ? { label: `Actualizar «${clip(titleOf(only.id), 40)}»`, hint: option(only).hint }
          : { label: `Actualizar todas (${candidates.length})`, hint: 'padres e hijos' },
      none: { label: 'No actualizar ninguna', hint: 'se quedan como están' },
      pickSome: () =>
        chooseMany(`¿Cuáles actualizo? ${pc.dim('(sin marcar, no se tocan)')}`, candidates.map(option), {
          initialValues: candidates.filter((c) => c.isRoot).map((c) => c.id),
          required: false,
        }),
    },
  );
}

/** Pide confirmación cuando se van a escribir muchas entries de una vez. */
export const confirmLargeMigration = (count: number, dst: string): Promise<boolean> =>
  askYesNo(
    `Se van a escribir ${pc.bold(String(count))} entries en ${pc.bold(dst)}. Revisa el árbol: ¿es lo que esperabas?`,
    false,
  );

export const askWithAssets = (missingCount: number): Promise<boolean> =>
  askYesNo(
    `¿Migrar con imágenes? ${pc.dim(`(se crean las ${missingCount} que faltan y se reutilizan las que ya existen)`)}`,
    true,
  );

/**
 * Cambios de modelo para destino: todos de una vez, ninguno, o elegidos uno por uno en una
 * lista agrupada por content type (marcar el content type marca todos sus cambios).
 */
export async function askModelChanges(options: ModelOption[], dst: string): Promise<ModelPick[]> {
  const picks = allPicks(options);
  const [only] = options;
  const single = picks.length === 1 && only?.picks[0] ? modelPickText(only.picks[0], only.diff, dst) : undefined;

  const groups: Record<string, Choice<ModelPick>[]> = {};
  for (const { diff, onlyReused, picks: ctPicks } of options) {
    const note = diff.missingCT
      ? pc.yellow(`  · nuevo: no existe en ${dst}`)
      : onlyReused && diff.missing.length
        ? pc.dim('  · solo entries reutilizadas: se agrega el campo, su contenido no se copia')
        : '';
    groups[`${diff.name} ${pc.dim(`(${diff.id})`)}${note}`] = ctPicks.map((pick) => {
      const { label, hint } = modelPickText(pick, diff, dst);
      return { value: pick, label, hint: clip(hint, 70) };
    });
  }

  return allOrSome(`Cambios en el modelo de ${pc.bold(dst)}: ${modelPicksSummary(picks)}`, picks, {
    all: single
      ? { label: `Aplicar: ${single.label}`, hint: clip(single.hint, 70) }
      : { label: `Aplicar todo (${picks.length})`, hint: modelPicksSummary(picks) },
    none: { label: 'No tocar el modelo', hint: `el modelo de ${dst} queda como está` },
    pickSome: async () => {
      const picked = await ask(() =>
        p.groupMultiselect({
          message: `¿Qué aplico? ${pc.dim('(espacio marca · marcar el content type marca todo lo suyo · Esc vuelve)')}`,
          options: groups as Record<string, p.Option<ModelPick>[]>,
          required: false,
          selectableGroups: true,
        }),
      );
      if (!picked.length) log.info(`No marcaste nada: el modelo de ${dst} no cambia.`);
      return picked;
    },
  });
}

/**
 * Confirmación antes de escribir. Si el destino parece producción (es `master` o tiene un
 * alias), no basta con "sí": hay que escribir el nombre del ambiente.
 */
export async function confirmWrite(dstEnv: Environment, question: string): Promise<boolean> {
  if (!looksLikeProduction(dstEnv)) return askYesNo(question, true);

  const why = dstEnv.aliases.length ? `tiene el alias ${dstEnv.aliases.join(', ')}` : 'es master';
  log.warn(`${pc.bold(dstEnv.id)} ${why}: probablemente es producción.`);
  await askText(`Para confirmar, escribe el nombre del ambiente ${pc.dim(`(${dstEnv.id})`)}`, {
    validate: (v) => (v === dstEnv.id ? undefined : `Escribe exactamente: ${dstEnv.id}`),
  });
  return true;
}

/** Elige un respaldo de la lista (el más reciente primero). Devuelve la ruta del archivo. */
export function pickBackup({ mine, legacy }: { mine: BackupFile[]; legacy: BackupFile[] }): Promise<string> {
  if (!mine.length && !legacy.length) throw new AbortError('No hay respaldos de tu cuenta.');
  const option = ({ file, data }: BackupFile, note = '') => ({
    value: file,
    label: `${new Date(data.createdAt).toLocaleString('es-CO')}  ${BACKUP_KIND_LABEL[data.kind]} ${data.src} → ${data.dst}`,
    hint: `${data.updated.length} actualizada(s), ${data.created.entries.length} creada(s)${note}`,
  });
  return choose('Respaldo', [
    ...mine.map((b) => option(b)),
    ...legacy.map((b) => option(b, ' · anterior, sin cuenta registrada')),
  ]);
}

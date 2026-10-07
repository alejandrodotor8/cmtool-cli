/**
 * Preguntas al usuario (con @clack/prompts). Cada función devuelve la respuesta; no lee ni
 * escribe en Contentful. Ctrl+C o Esc cancelan: se lanza CancelError.
 */
import * as p from '@clack/prompts';
import pc from 'picocolors';
import type { BackupFile } from '../backup.ts';
import { COMMANDS, type Command } from '../cli-args.ts';
import type { ContentType, Environment, Space } from '../contentful/types.ts';
import { parseIds } from '../core/ids.ts';
import { fieldType } from '../core/model.ts';
import type { ModelOption, ModelPick } from '../core/model-changes.ts';
import type { UpdateCandidate } from '../core/plan.ts';
import { parseSince } from '../core/query.ts';
import { AbortError, CancelError } from '../errors.ts';
import { log } from './log.ts';
import { clip, pad } from './table.ts';
import { BACKUP_KIND_LABEL, modelChangesQuestion } from './text.ts';

/** La respuesta de un prompt, o CancelError si el usuario canceló. */
function answer<T>(value: T): Exclude<T, symbol> {
  if (p.isCancel(value)) throw new CancelError();
  return value as Exclude<T, symbol>;
}

export interface Choice<T> {
  value: T;
  label: string;
  hint?: string;
}

// ───────────────────────── genéricas ─────────────────────────

/** Elegir una opción. */
export async function choose<T>(message: string, options: Choice<T>[], initialValue?: T): Promise<T> {
  return answer(await p.select<T>({ message, options: options as p.Option<T>[], initialValue, maxItems: 12 }));
}

/** Elegir una opción escribiendo para filtrar (listas largas). */
export async function search<T>(message: string, options: Choice<T>[], initialValue?: T): Promise<T> {
  return answer(
    await p.autocomplete<T>({
      message,
      placeholder: 'Escribe para filtrar…',
      options: options as p.Option<T>[],
      initialValue,
      maxItems: 12,
    }),
  );
}

/** Marcar varias opciones (se puede escribir para filtrar). */
export async function chooseMany<T>(
  message: string,
  options: Choice<T>[],
  { initialValues = [], required = true }: { initialValues?: T[]; required?: boolean } = {},
): Promise<T[]> {
  return answer(
    await p.autocompleteMultiselect<T>({
      message,
      placeholder: 'Escribe para filtrar · espacio marca · enter continúa',
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
  const value = answer(await p.text({ message, placeholder, validate: (v) => validate?.((v ?? '').trim()) }));
  return value.trim();
}

/** Sí / No. */
export async function askYesNo(message: string, initialValue: boolean): Promise<boolean> {
  return answer(await p.confirm({ message, active: 'Sí', inactive: 'No', initialValue }));
}

/** Ruta de un archivo existente (con autocompletado de rutas). */
export async function askFile(message: string): Promise<string> {
  return answer(await p.path({ message, directory: false }));
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

const envChoices = (envs: Environment[]) =>
  envs.map((e) => ({
    value: e.id,
    label: e.id,
    hint: e.aliases.length ? `alias: ${e.aliases.join(', ')}` : undefined,
  }));

export const pickSource = (envs: Environment[]): Promise<string> => choose('Ambiente de ORIGEN', envChoices(envs));

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
  const raw = answer(
    await p.multiline({
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
  const choice = await choose('¿Cambiadas desde cuándo?', [
    { value: 'hoy', label: 'Hoy' },
    { value: '7d', label: 'Últimos 7 días' },
    { value: '30d', label: 'Últimos 30 días' },
    { value: 'fecha', label: 'Desde una fecha…' },
  ]);
  const text =
    choice === 'fecha'
      ? await askText('Fecha', {
          placeholder: 'AAAA-MM-DD',
          validate: (v) => (parseSince(v) ? undefined : 'Usa el formato AAAA-MM-DD (por ejemplo 2026-10-01).'),
        })
      : choice;
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
  return chooseMany(
    `Estas entries ya existen en ${pc.bold(dst)} y cambiaron en ${pc.bold(src)}: ¿cuáles actualizo? ${pc.dim('(sin marcar, no se tocan)')}`,
    candidates.map((c) => ({
      value: c.id,
      label: `${clip(titleOf(c.id), 40)} ${pc.dim(c.isRoot ? '· la elegiste' : '· hijo')}`,
      hint: `${c.fields.length} campo(s): ${clip(c.fields.map((f) => f.name).join(', '), 50)}`,
    })),
    { initialValues: candidates.filter((c) => c.isRoot).map((c) => c.id), required: false },
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

/** Checks agrupados por content type con lo que falta en el modelo de destino. Devuelve lo marcado. */
export async function askModelChanges(options: ModelOption[], dst: string): Promise<ModelPick[]> {
  const groups: Record<string, { value: ModelPick; label: string; hint?: string }[]> = {};
  for (const { diff, onlyReused, editorFields } of options) {
    const note = diff.missingCT
      ? pc.yellow(`  · nuevo: no existe en ${dst}`)
      : onlyReused && diff.missing.length
        ? pc.dim('  · solo entries reutilizadas: se agrega el campo, su contenido no se copia')
        : '';
    const group = `${diff.name} ${pc.dim(`(${diff.id})`)}${note}`;
    if (diff.missingCT) {
      groups[group] = [
        {
          value: { ctId: diff.id },
          label: `Crear «${diff.name}» con sus ${diff.missing.length} campos`,
          hint: clip(diff.missing.map((f) => f.name).join(', '), 60),
        },
      ];
      continue;
    }
    const nameWidth = Math.max(0, ...diff.missing.map((f) => clip(f.name, 28).length));
    const fieldName = new Map(diff.rows.map((r) => [r.field.id, r.field.name]));
    groups[group] = [
      ...diff.missing.map((field) => ({
        value: { ctId: diff.id, field },
        label: `${pad(clip(field.name, 28), nameWidth)}  ${pc.dim(field.id)}`,
        hint: fieldType(field),
      })),
      ...(editorFields.length
        ? [
            {
              value: { ctId: diff.id, editor: true },
              label: `Copiar apariencia del editor de ${editorFields.length} campo(s)`,
              hint: `help text y widget: ${clip(editorFields.map((id) => fieldName.get(id) ?? id).join(', '), 50)}`,
            },
          ]
        : []),
    ];
  }

  const { question, note } = modelChangesQuestion(options, dst);
  return answer(
    await p.groupMultiselect({
      message: `${question} ${pc.dim(`(${note})`)}`,
      options: groups,
      required: false,
      selectableGroups: true,
    }),
  );
}

/**
 * Confirmación antes de escribir. Si el destino parece producción (es `master` o tiene un
 * alias), no basta con "sí": hay que escribir el nombre del ambiente.
 */
export async function confirmWrite(dstEnv: Environment, question: string): Promise<boolean> {
  const looksLikeProduction = dstEnv.id === 'master' || dstEnv.aliases.length > 0;
  if (!looksLikeProduction) return askYesNo(question, true);

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

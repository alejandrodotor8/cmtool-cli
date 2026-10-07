/**
 * Preguntas al usuario (con @clack/prompts). Cada función devuelve la respuesta; no lee ni
 * escribe en Contentful. Ctrl+C o Esc cancelan: se lanza CancelError.
 */
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { BACKUP_DIR, type BackupData } from '../backup.ts';
import type { Environment, Space } from '../contentful/types.ts';
import { parseEntryIds } from '../core/ids.ts';
import { fieldType } from '../core/model.ts';
import type { ModelOption, ModelPick } from '../core/plan.ts';
import { AbortError, CancelError } from '../errors.ts';
import { log } from './log.ts';
import { clip, pad } from './table.ts';

/** La respuesta de un prompt, o CancelError si el usuario canceló. */
function answer<T>(value: T): Exclude<T, symbol> {
  if (p.isCancel(value)) throw new CancelError();
  return value as Exclude<T, symbol>;
}

export async function pickSpace(spaces: Space[], defaultId: string | undefined): Promise<string> {
  const options = spaces.map((s) => ({ value: s.sys.id, label: s.name, hint: s.sys.id }));
  return answer(
    await p.autocomplete({
      message: 'Space',
      placeholder: 'Escribe para filtrar…',
      options,
      initialValue: options.some((o) => o.value === defaultId) ? defaultId : undefined,
      maxItems: 12,
    }),
  );
}

const envOptions = (envs: Environment[]) =>
  envs.map((e) => ({
    value: e.id,
    label: e.id,
    hint: e.aliases.length ? `alias: ${e.aliases.join(', ')}` : undefined,
  }));

export async function pickSource(envs: Environment[]): Promise<string> {
  return answer(await p.select({ message: 'Ambiente de ORIGEN', options: envOptions(envs), maxItems: 12 }));
}

export async function pickDestination(envs: Environment[], src: string): Promise<string> {
  return answer(
    await p.select({
      message: `Ambiente de DESTINO ${pc.dim(`(origen: ${src})`)}`,
      options: envOptions(envs).filter((o) => o.value !== src),
      maxItems: 12,
    }),
  );
}

/**
 * Pide los entry IDs (o URLs de entries). Acepta varias líneas: se puede pegar una columna
 * o fila de Excel. Enter agrega una línea; para continuar se usa Tab + Enter en [ submit ],
 * así una celda vacía en lo que pegas no envía la respuesta antes de tiempo.
 */
export async function askEntryIds(): Promise<string[]> {
  const raw = answer(
    await p.multiline({
      message: `Entry IDs de Contentful ${pc.dim('(o la URL de la entry, copiada del navegador)')}`,
      placeholder: 'Uno por línea (pega una columna de Excel) o separados por coma. Tab + Enter para continuar.',
      showSubmit: true,
      validate: (value) => {
        const { ids, invalid } = parseEntryIds(value ?? '');
        if (invalid.length) return `No es un entry ID ni la URL de una entry: ${clip(invalid.join(', '), 60)}`;
        if (!ids.length) return 'Pega al menos un entry ID.';
        return undefined;
      },
    }),
  );
  const { ids } = parseEntryIds(raw);
  log.info(`${ids.length} entry ID(s): ${clip(ids.join(', '), 90)}`);
  return ids;
}

const yesNo = async (message: string, initialValue: boolean) =>
  answer(await p.confirm({ message, active: 'Sí', inactive: 'No', initialValue }));

/** Pide confirmación cuando se van a escribir muchas entries de una vez. */
export const confirmLargeMigration = (count: number, dst: string): Promise<boolean> =>
  yesNo(
    `Se van a escribir ${pc.bold(String(count))} entries en ${pc.bold(dst)}. Revisa el árbol: ¿es lo que esperabas?`,
    false,
  );

export const askWithAssets = (missingCount: number): Promise<boolean> =>
  yesNo(
    `¿Migrar con imágenes? ${pc.dim(`(se crean las ${missingCount} que faltan y se reutilizan las que ya existen)`)}`,
    true,
  );

/** Checks agrupados por content type con lo que falta en el modelo de destino. Devuelve lo marcado. */
export async function askModelChanges(options: ModelOption[], dst: string): Promise<ModelPick[]> {
  const groups: Record<string, { value: ModelPick; label: string; hint?: string }[]> = {};
  for (const { diff, onlyReused } of options) {
    const group = `${diff.name} ${pc.dim(`(${diff.id})`)}${onlyReused ? pc.dim('  · solo entries reutilizadas: se agrega el campo, su contenido no se copia') : ''}`;
    if (diff.missingCT) {
      groups[group] = [
        {
          value: { ctId: diff.id },
          label: 'Crear content type completo',
          hint: `${diff.missing.length} campos; si no, sus entries no se migran`,
        },
      ];
      continue;
    }
    const nameWidth = Math.max(...diff.missing.map((f) => clip(f.name, 28).length));
    groups[group] = diff.missing.map((field) => ({
      value: { ctId: diff.id, field },
      label: `${pad(clip(field.name, 28), nameWidth)}  ${pc.dim(field.id)}`,
      hint: fieldType(field),
    }));
  }

  return answer(
    await p.groupMultiselect({
      message: `¿Qué agrego al modelo de ${pc.bold(dst)}? ${pc.dim('(sin marcar nada, el modelo no se toca)')}`,
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
  if (!looksLikeProduction) return yesNo(question, true);

  const why = dstEnv.aliases.length ? `tiene el alias ${dstEnv.aliases.join(', ')}` : 'es master';
  log.warn(`${pc.bold(dstEnv.id)} ${why}: probablemente es producción.`);
  answer(
    await p.text({
      message: `Para confirmar, escribe el nombre del ambiente ${pc.dim(`(${dstEnv.id})`)}`,
      validate: (value) => ((value ?? '').trim() === dstEnv.id ? undefined : `Escribe exactamente: ${dstEnv.id}`),
    }),
  );
  return true;
}

/** Elige un respaldo de la lista (el más reciente primero). Devuelve la ruta del archivo. */
export async function pickBackup(backups: { file: string; data: BackupData }[]): Promise<string> {
  if (!backups.length) throw new AbortError(`No hay respaldos en ${BACKUP_DIR}.`);
  return answer(
    await p.select({
      message: 'Respaldo',
      maxItems: 12,
      options: backups.map(({ file, data }) => ({
        value: file,
        label: `${new Date(data.createdAt).toLocaleString('es-CO')}  ${data.kind === 'restore' ? 'restore' : 'migración'} ${data.src} → ${data.dst}`,
        hint: `${data.updated.length} actualizada(s), ${data.created.entries.length} creada(s)`,
      })),
    }),
  );
}

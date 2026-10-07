/**
 * Preguntas al usuario. Cada función devuelve la respuesta; no lee ni escribe en Contentful.
 */
import { createInterface } from 'node:readline';
import { checkbox, confirm, input, Separator, select } from '@inquirer/prompts';
import pc from 'picocolors';
import { BACKUP_DIR, type BackupData } from '../backup.ts';
import type { Environment, Space } from '../contentful/types.ts';
import { parseEntryIds } from '../core/ids.ts';
import { fieldType } from '../core/model.ts';
import type { ModelOption, ModelPick } from '../core/plan.ts';
import { AbortError } from '../errors.ts';
import { log } from './log.ts';
import { clip, pad } from './table.ts';

export const pickSpace = (spaces: Space[], defaultId: string | undefined): Promise<string> =>
  select({
    message: 'Space',
    choices: spaces.map((s) => ({ name: `${s.name} ${pc.dim(s.sys.id)}`, value: s.sys.id })),
    default: defaultId,
    pageSize: 15,
  });

const envChoices = (envs: Environment[]) =>
  envs.map((e) => ({
    name: e.id + (e.aliases.length ? pc.dim(`  (alias: ${e.aliases.join(', ')})`) : ''),
    value: e.id,
  }));

export const pickSource = (envs: Environment[]): Promise<string> =>
  select({ message: 'Ambiente ORIGEN', choices: envChoices(envs), pageSize: 15 });

export const pickDestination = (envs: Environment[], src: string): Promise<string> =>
  select({ message: 'Ambiente DESTINO', choices: envChoices(envs).filter((c) => c.value !== src), pageSize: 15 });

/**
 * Lee texto de varias líneas hasta una línea vacía. Así se puede pegar una columna de
 * Excel, que llega como una línea por celda. Ctrl+C cancela igual que en los demás prompts.
 */
function readUntilEmptyLine(): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
    const lines: string[] = [];
    rl.on('line', (line) => {
      if (line.trim()) lines.push(line);
      else if (lines.length) rl.close();
    });
    rl.on('SIGINT', () => {
      const cancel = new Error('Cancelado');
      cancel.name = 'ExitPromptError';
      reject(cancel);
      rl.close();
    });
    rl.on('close', () => resolve(lines.join('\n')));
  });
}

/** Pide los entry IDs (o URLs de entries). Repite la pregunta si algo no tiene forma de entry ID. */
export async function askEntryIds(): Promise<string[]> {
  console.log(
    `${pc.green('?')} ${pc.bold('Entry IDs de Contentful')} ${pc.dim('(o la URL de la entry, copiada del navegador)')}`,
  );
  console.log(
    pc.dim(
      '  Uno por línea (puedes pegar una columna de Excel) o separados por coma o espacio.\n' +
        '  Presiona Enter en una línea vacía para terminar.',
    ),
  );
  while (true) {
    const { ids, invalid } = parseEntryIds(await readUntilEmptyLine());
    if (invalid.length) {
      log.err(`Esto no parece un entry ID ni la URL de una entry: ${clip(invalid.join(', '), 80)}`);
      log.info('Vuelve a pegar los IDs.');
      continue;
    }
    if (!ids.length) {
      log.warn('Pega al menos un entry ID.');
      continue;
    }
    log.ok(`${ids.length} entry ID(s): ${clip(ids.join(', '), 90)}`);
    return ids;
  }
}

/** Pide confirmación cuando se van a escribir muchas entries de una vez. */
export const confirmLargeMigration = (count: number, dst: string): Promise<boolean> =>
  confirm({
    message: `Se van a escribir ${count} entries en ${pc.bold(dst)}. Revisa el árbol: ¿es lo que esperabas?`,
    default: false,
  });

export const askWithAssets = (missingCount: number): Promise<boolean> =>
  confirm({
    message: `¿Migrar con imágenes? (se crean las ${missingCount} que faltan y se reutilizan las que ya existen)`,
    default: true,
  });

/** Lista con checks de lo que falta en el modelo de destino. Devuelve las opciones marcadas. */
export function askModelChanges(options: ModelOption[], dst: string): Promise<ModelPick[]> {
  const choices: (Separator | { name: string; value: ModelPick })[] = [];
  for (const { diff, onlyReused } of options) {
    const note = onlyReused ? '  · solo entries reutilizadas: se agrega el campo, su contenido no se copia' : '';
    choices.push(new Separator(pc.dim(`── ${diff.name} (${diff.id})${note}`)));

    if (diff.missingCT) {
      choices.push({
        name: `Crear content type completo ${pc.dim(`(${diff.missing.length} campos; si no, sus entries no se migran)`)}`,
        value: { ctId: diff.id },
      });
      continue;
    }
    const nameWidth = Math.max(...diff.missing.map((f) => clip(f.name, 28).length));
    for (const field of diff.missing) {
      choices.push({
        name: `${pad(clip(field.name, 28), nameWidth)}  ${pc.dim(pad(field.id, 20))} ${pc.dim(fieldType(field))}`,
        value: { ctId: diff.id, field },
      });
    }
  }

  console.log();
  return checkbox({
    message: `¿Qué agrego al modelo de ${pc.bold(dst)}? ${pc.dim('(espacio marca · a marca todo · enter continúa · sin marcar = no se toca)')}`,
    choices,
    pageSize: 20,
  });
}

/**
 * Confirmación antes de escribir. Si el destino parece producción (es `master` o tiene
 * un alias), no basta con "sí": hay que escribir el nombre del ambiente.
 */
export async function confirmWrite(dstEnv: Environment, question: string): Promise<boolean> {
  const looksLikeProduction = dstEnv.id === 'master' || dstEnv.aliases.length > 0;
  if (!looksLikeProduction) return confirm({ message: question, default: true });

  const why = dstEnv.aliases.length ? `tiene el alias ${dstEnv.aliases.join(', ')}` : 'es master';
  log.warn(`${pc.bold(dstEnv.id)} ${why}: probablemente es producción.`);
  const typed = await input({ message: `Para confirmar, escribe el nombre del ambiente (${dstEnv.id})` });
  return typed.trim() === dstEnv.id;
}

/** Elige un respaldo de la lista (el más reciente primero). Devuelve la ruta del archivo. */
export function pickBackup(backups: { file: string; data: BackupData }[]): Promise<string> {
  if (!backups.length) throw new AbortError(`No hay respaldos en ${BACKUP_DIR}.`);
  return select({
    message: 'Respaldo',
    pageSize: 15,
    choices: backups.map(({ file, data }) => ({
      value: file,
      name: [
        new Date(data.createdAt).toLocaleString('es-CO'),
        `${data.kind === 'restore' ? 'restore' : 'migración'} ${data.src} → ${data.dst}`,
        pc.dim(`${data.updated.length} actualizada(s), ${data.created.entries.length} creada(s)`),
      ].join('  '),
    })),
  });
}

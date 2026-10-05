/**
 * Preguntas al usuario. Cada función devuelve la respuesta; no lee ni escribe en Contentful.
 */
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

export async function pickEnvironments(envs: Environment[]): Promise<{ src: string; dst: string }> {
  const choices = envs.map((e) => ({
    name: e.id + (e.aliases.length ? pc.dim(`  (alias: ${e.aliases.join(', ')})`) : ''),
    value: e.id,
  }));
  const src = await select({ message: 'Ambiente ORIGEN', choices, pageSize: 15 });
  const dst = await select({
    message: 'Ambiente DESTINO',
    choices: choices.filter((c) => c.value !== src),
    pageSize: 15,
  });
  return { src, dst };
}

export async function askEntryIds(): Promise<string[]> {
  const raw = await input({
    message: 'Entry ID(s) o URL(s) (separados por coma o espacio)',
    validate: (v) => parseEntryIds(v).length > 0 || 'Pega al menos un entry ID',
  });
  return parseEntryIds(raw);
}

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

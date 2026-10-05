/**
 * Respaldos locales de cada ejecución, para poder deshacerla con `ctf-migrate restore`.
 * Se guardan en ~/.ctf-migrate/backups/, legibles solo por el usuario.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Entry, TagLink } from './contentful/types.ts';
import { contentTypeOf } from './core/entries.ts';
import { AbortError } from './errors.ts';

export const BACKUP_DIR = path.join(os.homedir(), '.ctf-migrate', 'backups');

/** Cómo estaba una entry en destino justo antes de actualizarla. */
export interface SavedEntry {
  id: string;
  contentType: string;
  title: string;
  /** `sys.version` antes de actualizar; la actualización la deja en version + 1. */
  version: number;
  fields: Entry['fields'];
  tags: TagLink[];
  /** Se guarda en `false` antes de actualizar y pasa a `true` cuando la actualización funcionó. */
  applied: boolean;
}

export interface BackupData {
  version: 1;
  kind: 'migrate' | 'restore';
  createdAt: string;
  spaceId: string;
  src: string;
  dst: string;
  rootIds: string[];
  updated: SavedEntry[];
  /** Lo que se creó. `restore` no lo borra: solo lo lista. */
  created: { entries: string[]; assets: string[]; contentTypes: string[]; tags: string[] };
  /** Campos agregados al modelo, por content type. */
  fieldsAdded: Record<string, string[]>;
}

export type CreatedKind = keyof BackupData['created'];
export type Backup = ReturnType<typeof startBackup>;

/**
 * Crea el archivo de respaldo y lo vuelve a guardar en cada cambio, para que quede
 * completo aunque el proceso se corte a la mitad.
 */
export function startBackup(meta: Pick<BackupData, 'kind' | 'spaceId' | 'src' | 'dst' | 'rootIds'>, dir = BACKUP_DIR) {
  const createdAt = new Date().toISOString();
  const data: BackupData = {
    version: 1,
    createdAt,
    ...meta,
    updated: [],
    created: { entries: [], assets: [], contentTypes: [], tags: [] },
    fieldsAdded: {},
  };

  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  // Sin ":" en el nombre, para que también sea válido en Windows.
  const file = path.join(dir, `${createdAt.replace(/[:.]/g, '-')}_${meta.kind}_${meta.dst}.json`);
  const save = () => fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  save();

  return {
    file,
    data,
    recordUpdate(entry: Entry, title: string) {
      data.updated.push({
        id: entry.sys.id,
        contentType: contentTypeOf(entry),
        title,
        version: entry.sys.version,
        fields: entry.fields ?? {},
        tags: entry.metadata?.tags ?? [],
        applied: false,
      });
      save();
    },
    /** La actualización de esa entry sí se hizo. */
    confirmUpdate(id: string) {
      const saved = data.updated.findLast((e) => e.id === id);
      if (saved) saved.applied = true;
      save();
    },
    recordCreated(kind: CreatedKind, id: string) {
      data.created[kind].push(id);
      save();
    },
    recordFields(ctId: string, fieldIds: string[]) {
      data.fieldsAdded[ctId] = [...(data.fieldsAdded[ctId] ?? []), ...fieldIds];
      save();
    },
  };
}

function tryRead(file: string): BackupData | undefined {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as BackupData;
    return data?.version === 1 && Array.isArray(data.updated) ? data : undefined;
  } catch {
    return undefined;
  }
}

export function readBackup(file: string): BackupData {
  const data = tryRead(file);
  if (!data) throw new AbortError(`No pude leer el respaldo ${file}.`);
  return data;
}

/** Respaldos guardados, del más reciente al más antiguo. Ignora archivos que no se puedan leer. */
export function listBackups(dir = BACKUP_DIR): { file: string; data: BackupData }[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .flatMap((name) => {
      const file = path.join(dir, name);
      const data = tryRead(file);
      return data ? [{ file, data }] : [];
    })
    .sort((a, b) => b.data.createdAt.localeCompare(a.data.createdAt));
}

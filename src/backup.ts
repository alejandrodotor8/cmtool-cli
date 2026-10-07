/**
 * Respaldos locales de cada ejecución, para poder deshacerla con `cfm restore`.
 * Se guardan en ~/.ctf-migrate/backups/<usuario>/, una carpeta por cuenta de Contentful para
 * que no se mezclen, legibles solo por el usuario del sistema. La carpeta conserva el nombre
 * anterior de la herramienta para no perder los respaldos que ya existen.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Account, Entry, TagLink } from './contentful/types.ts';
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
  /** Qué comando lo creó: migrar entries, modelo o imágenes, o un restore. */
  kind: 'migrate' | 'model' | 'assets' | 'restore';
  createdAt: string;
  /** Cuenta que hizo la ejecución. Falta en los respaldos anteriores a la versión 0.6.0. */
  account?: Account;
  spaceId: string;
  src: string;
  dst: string;
  rootIds: string[];
  updated: SavedEntry[];
  /** Lo que se creó. `restore` no lo borra: solo lo lista. */
  created: { entries: string[]; assets: string[]; contentTypes: string[]; tags: string[] };
  /** Campos agregados al modelo, por content type. */
  fieldsAdded: Record<string, string[]>;
  /** Campos cuya apariencia del editor se cambió, por content type (falta en respaldos anteriores). */
  editorUpdated?: Record<string, string[]>;
}

export type CreatedKind = keyof BackupData['created'];
export type Backup = ReturnType<typeof startBackup>;

/**
 * Crea el archivo de respaldo y lo vuelve a guardar en cada cambio, para que quede
 * completo aunque el proceso se corte a la mitad.
 */
/** Carpeta de respaldos de una cuenta (el ID solo con letras, números, - y _: no puede salirse de la raíz). */
export const accountBackupDir = (account: Pick<Account, 'userId'>, root = BACKUP_DIR) =>
  path.join(root, account.userId.replace(/[^A-Za-z0-9_-]/g, '_'));

export function startBackup(
  meta: Pick<BackupData, 'kind' | 'spaceId' | 'src' | 'dst' | 'rootIds'> & { account: Account },
  root = BACKUP_DIR,
) {
  const dir = accountBackupDir(meta.account, root);
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
    recordEditor(ctId: string, fieldIds: string[]) {
      data.editorUpdated = { ...data.editorUpdated, [ctId]: [...(data.editorUpdated?.[ctId] ?? []), ...fieldIds] };
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

export type BackupFile = { file: string; data: BackupData };

/** Respaldos (`.json` válidos) de una carpeta, del más reciente al más antiguo. */
function readDir(dir: string): BackupFile[] {
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

/**
 * Respaldos de una cuenta (`mine`) y los anteriores a 0.6.0, que no registran cuenta
 * (`legacy`). Los de otras cuentas no aparecen.
 */
export function listBackups(
  account: Pick<Account, 'userId'>,
  root = BACKUP_DIR,
): { mine: BackupFile[]; legacy: BackupFile[] } {
  return {
    mine: readDir(accountBackupDir(account, root)),
    legacy: readDir(root).filter(({ data }) => !data.account),
  };
}

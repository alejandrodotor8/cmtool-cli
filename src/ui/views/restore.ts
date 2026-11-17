import {
  BACKUP_KIND_LABEL,
  type BackupData,
  type Entry,
  RESTORE,
  type RestoreStatus,
  restoreStatus,
  type SavedEntry,
} from 'cmtool-core';
import pc from 'picocolors';
import { log } from '../log.ts';
import { clip, table } from '../table.ts';
import { formatDate, route } from './shared.ts';

const RESTORE_LABEL: Record<RestoreStatus, string> = {
  [RESTORE.RESTORE]: pc.green('se restaura'),
  [RESTORE.CHANGED]: pc.yellow('se editó después → ese cambio también se deshace'),
  [RESTORE.MISSING]: pc.red('ya no existe → se omite'),
  [RESTORE.NOT_APPLIED]: pc.dim('la migración no la alcanzó a actualizar → se omite'),
};

/** Qué va a restaurar un respaldo, y lo que la migración creó (que no se borra). */
export function renderRestore(data: BackupData, items: { saved: SavedEntry; current: Entry | undefined }[]): void {
  log.step('Restaurar');
  table({
    title: `${route(data.src, data.dst)}  ${pc.dim(`${BACKUP_KIND_LABEL[data.kind]} del ${formatDate(data.createdAt)}`)}`,
    columns: [
      { header: 'Entry' },
      { header: 'Content type' },
      { header: 'ID' },
      { header: 'Versión', align: 'center' },
      { header: 'Acción' },
    ],
    rows: items.map(({ saved, current }) => [
      clip(saved.title),
      pc.dim(saved.contentType),
      pc.dim(saved.id),
      `${saved.version} → ${current?.sys.version ?? '—'}`,
      RESTORE_LABEL[restoreStatus(saved, current)],
    ]),
  });
  if (items.some(({ saved, current }) => restoreStatus(saved, current) === RESTORE.CHANGED)) {
    log.warn('Algunas entries se editaron después de la migración: restaurarlas también deshace esos cambios.');
  }

  const parts = createdParts(data);
  if (parts.length) {
    log.warn(`Lo que se creó no se borra (la herramienta nunca borra): ${parts.join(', ')}.`);
    if (data.created.entries.length) log.info(`entries: ${clip(data.created.entries.join(', '), 100)}`);
    if (data.created.assets.length) log.info(`imágenes: ${clip(data.created.assets.join(', '), 100)}`);
  }
  const added = Object.entries(data.fieldsAdded).map(([ctId, ids]) => `${ctId}.${ids.join(`, ${ctId}.`)}`);
  if (added.length) log.info(`Campos agregados al modelo (no se quitan): ${clip(added.join(', '), 100)}`);
  const editor = Object.entries(data.editorUpdated ?? {}).map(([ctId, ids]) => `${ctId} (${ids.length})`);
  if (editor.length) log.info(`Apariencia del editor actualizada (no se revierte): ${clip(editor.join(', '), 100)}`);
  const info = Object.keys(data.infoUpdated ?? {});
  if (info.length) {
    log.info(`Nombre, descripción o campo de título cambiados (no se revierten): ${clip(info.join(', '), 100)}`);
  }
  const rules = Object.entries(data.rulesUpdated ?? {}).map(
    ([ctId, fields]) => `${ctId}.${fields.map((f) => f.id).join(`, ${ctId}.`)}`,
  );
  if (rules.length) {
    log.info(
      `Reglas de campos cambiadas (no se revierten; cómo estaban queda en el respaldo): ${clip(rules.join(', '), 100)}`,
    );
  }
}

/** "2 entry(s), 1 imagen(es)…" con lo que se creó en una ejecución. */
export function createdParts({ created, fieldsAdded }: BackupData): string[] {
  const fields = Object.values(fieldsAdded).reduce((n, ids) => n + ids.length, 0);
  return [
    created.entries.length && `${created.entries.length} entry(s)`,
    created.assets.length && `${created.assets.length} imagen(es)`,
    created.contentTypes.length && `${created.contentTypes.length} content type(s)`,
    fields && `${fields} campo(s)`,
    created.tags.length && `${created.tags.length} tag(s)`,
  ].filter((part): part is string => Boolean(part));
}

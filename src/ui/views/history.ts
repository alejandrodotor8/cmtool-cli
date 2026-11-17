import path from 'node:path';
import { BACKUP_KIND_LABEL, type BackupData } from 'cmtool-core';
import pc from 'picocolors';
import { table } from '../table.ts';
import { createdParts } from './restore.ts';
import { formatDate, route } from './shared.ts';

/** Una fila por ejecución guardada en los respaldos, la más reciente primero. */
export function renderHistory(backups: { file: string; data: BackupData }[], title: string): void {
  table({
    spacing: 1,
    title: `${pc.bold(title)}  ${pc.dim(`${backups.length} ejecución(es)`)}`,
    columns: [
      { header: 'Fecha' },
      { header: 'Tipo' },
      { header: 'Ambientes' },
      { header: 'Actualizadas', align: 'center' },
      { header: 'Creado' },
      { header: 'Respaldo' },
    ],
    rows: backups.map(({ file, data }) => [
      formatDate(data.createdAt),
      BACKUP_KIND_LABEL[data.kind],
      route(data.src, data.dst),
      String(data.updated.filter((e) => e.applied !== false).length),
      pc.dim(createdParts(data).join(', ') || '—'),
      pc.dim(path.basename(file)),
    ]),
  });
}

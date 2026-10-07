/** `cfm history`: migraciones anteriores, a partir de sus respaldos. Sin llamadas a la API. */

import pc from 'picocolors';
import { APP_NAME } from '../app.ts';
import { BACKUP_DIR, listBackups } from '../backup.ts';
import { printOutro, printTitle } from '../ui/header.ts';
import { renderHistory } from '../ui/views/history.ts';

export async function history(): Promise<number> {
  printTitle('Historial');
  const backups = listBackups();
  if (!backups.length) {
    printOutro(`Todavía no hay migraciones ${pc.dim(`(los respaldos se guardan en ${BACKUP_DIR})`)}`);
    return 0;
  }
  renderHistory(backups);
  printOutro(`Para deshacer una: ${pc.cyan(`${APP_NAME} restore`)} ${pc.dim(`· respaldos en ${BACKUP_DIR}`)}`);
  return 0;
}

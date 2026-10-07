/**
 * `cfm history`: migraciones anteriores de tu cuenta, a partir de sus respaldos.
 * Una sola llamada a la API (saber qué cuenta eres); los de otras cuentas no aparecen.
 */
import pc from 'picocolors';
import { APP_NAME } from '../app.ts';
import { accountBackupDir, listBackups } from '../backup.ts';
import type { CliArgs } from '../cli-args.ts';
import { printOutro, printTitle } from '../ui/header.ts';
import { renderHistory } from '../ui/views/history.ts';
import { openSession } from './context.ts';

export async function history(args: CliArgs): Promise<number> {
  printTitle('Historial');
  const account = await openSession(args).account();
  const { mine, legacy } = listBackups(account);
  const dir = accountBackupDir(account);

  if (!mine.length && !legacy.length) {
    printOutro(`Todavía no hay migraciones con esta cuenta ${pc.dim(`(los respaldos se guardan en ${dir})`)}`);
    return 0;
  }
  if (mine.length) renderHistory(mine, `Cuenta ${account.email ?? account.userId}`);
  if (legacy.length) renderHistory(legacy, 'Anteriores (no registran la cuenta)');
  printOutro(`Para deshacer una: ${pc.cyan(`${APP_NAME} restore`)} ${pc.dim(`· respaldos en ${dir}`)}`);
  return 0;
}

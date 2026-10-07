/**
 * Arranque del comando: corre main y traduce los errores a mensajes y códigos de salida.
 * Lo usan los dos ejecutables de bin/: el del build (dist/) y el de desarrollo (src/).
 */
import pc from 'picocolors';
import { AbortError, formatError, isCancel } from './errors.ts';
import { main } from './main.ts';
import type { RunMode } from './ui/header.ts';
import { log } from './ui/log.ts';

export async function run(argv: string[], mode: RunMode): Promise<never> {
  try {
    process.exit(await main(argv, mode));
  } catch (e) {
    if (isCancel(e)) {
      console.log(pc.dim('\nCancelado.'));
      process.exit(0);
    }
    if (e instanceof AbortError) {
      log.err(e.message);
      if (e.hint) log.info(e.hint);
      process.exit(1);
    }
    const msg = formatError(e);
    log.err(msg);
    if (msg.startsWith('401')) log.info('Tu sesión expiró. Corre: contentful login');
    process.exit(1);
  }
}

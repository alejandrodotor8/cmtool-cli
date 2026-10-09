/**
 * Arranque del comando: corre main y traduce los errores a mensajes y códigos de salida.
 * Lo usan los dos comandos de bin/ (el del build y el de desarrollo) y los ejecutables (src/exe.ts).
 */
import pc from 'picocolors';
import { APP_NAME } from './app.ts';
import { AbortError, formatError, isCancel, statusOf } from './errors.ts';
import { main } from './main.ts';
import { printCancelled, printOutro, type RunMode } from './ui/header.ts';
import { log } from './ui/log.ts';
import { waitForEnter } from './ui/pause.ts';

/** Con `pauseOnExit`, espera un Enter antes de salir (ver ui/pause.ts). */
export async function run(argv: string[], mode: RunMode, { pauseOnExit = false } = {}): Promise<never> {
  const code = await exitCode(argv, mode);
  if (pauseOnExit) await waitForEnter();
  process.exit(code);
}

async function exitCode(argv: string[], mode: RunMode): Promise<number> {
  try {
    return await main(argv, mode);
  } catch (e) {
    if (isCancel(e)) {
      printCancelled();
      return 0;
    }
    if (e instanceof AbortError) {
      log.err(e.message);
      if (e.hint) log.info(e.hint);
    } else {
      const msg = formatError(e);
      log.err(msg);
      if (statusOf(e) === 401) {
        log.info(
          `Tu sesión expiró o el token ya no sirve. Pega uno nuevo con ${APP_NAME} login (o "Iniciar sesión" en el menú).`,
        );
      }
    }
    printOutro(pc.red('Se detuvo.'));
    return 1;
  }
}

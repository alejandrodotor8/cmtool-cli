import { createInterface } from 'node:readline';
import pc from 'picocolors';

/**
 * En Windows, la ventana que abre un doble clic sobre el ejecutable se cierra apenas termina,
 * y con ella el resumen o el error. Con doble clic no hay argumentos: en ese caso se espera un Enter.
 * Desde una terminal (con argumentos) no hace falta, y en macOS la ventana queda abierta sola.
 */
export const pausesOnExit = (platform: NodeJS.Platform, argv: string[], interactive: boolean): boolean =>
  platform === 'win32' && argv.length === 0 && interactive;

/** Espera un Enter (o que se cierre la entrada) antes de seguir. */
export function waitForEnter(
  input: NodeJS.ReadStream | NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): Promise<void> {
  // Las preguntas pueden dejar la terminal en modo "tecla por tecla": aquí se lee una línea.
  if ('setRawMode' in input && input.isTTY) input.setRawMode(false);
  output.write(pc.dim('\nPresiona Enter para cerrar.\n'));
  return new Promise((resolve) => {
    const lines = createInterface({ input, terminal: false });
    lines.once('line', () => lines.close());
    lines.once('close', () => resolve());
  });
}

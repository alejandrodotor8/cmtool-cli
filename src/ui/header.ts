import * as p from '@clack/prompts';
import pc from 'picocolors';

/** De dónde corre la herramienta: el build (dist/) o el código fuente (src/). */
export type RunMode = 'build' | 'dev';

/** Inicio del comando: nombre, título y avisos de --dry-run y modo desarrollo. */
export function printHeader(title: string, { dryRun, mode, note }: { dryRun: boolean; mode: RunMode; note?: string }) {
  const detail = dryRun ? pc.yellow('--dry-run: no se escribe nada') : note ? pc.dim(note) : '';
  const dev = mode === 'dev' ? pc.yellow(' [desarrollo: código fuente]') : '';
  console.log();
  p.intro(`${pc.bgCyan(pc.black(' ctf-migrate '))} ${pc.bold(title)}${dev}${detail ? `  ${detail}` : ''}`);
}

/** Cierre del comando. */
export function printOutro(message: string) {
  p.outro(message);
}

/** Cierre cuando el usuario decide no seguir. Todas las preguntas van antes de escribir. */
export function printCancelled() {
  p.cancel('Cancelado: no se escribió nada.');
}

/** Recuadro con información final (links, respaldo, comandos para repetir o deshacer). */
export function printNote(lines: string[], title: string) {
  p.note(lines.join('\n'), title);
}

/** Con animaciones (spinners, barras) solo si es una terminal y no se pidió --verbose. */
export const shouldAnimate = (verbose: boolean) => !verbose && Boolean(process.stdout.isTTY);

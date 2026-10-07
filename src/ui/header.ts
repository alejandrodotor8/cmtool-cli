import * as p from '@clack/prompts';
import pc from 'picocolors';
import { VERSION } from '../version.ts';

/** De dónde corre la herramienta: el build (dist/) o el código fuente (src/). */
export type RunMode = 'build' | 'dev';

/** Presentación: nombre, versión y si se corre el código fuente. Una sola vez por ejecución. */
export function printIntro(mode: RunMode) {
  const dev = mode === 'dev' ? pc.yellow('  [desarrollo: código fuente]') : '';
  console.log();
  p.intro(`${pc.bgCyan(pc.black(' ctf-migrate '))} ${pc.dim(`v${VERSION}`)}${dev}`);
}

/** Título del comando, con aviso de --dry-run o una nota. */
export function printTitle(title: string, { dryRun = false, note }: { dryRun?: boolean; note?: string } = {}) {
  const detail = dryRun ? pc.yellow('--dry-run: no se escribe nada') : note ? pc.dim(note) : '';
  p.log.step(`${pc.bold(title)}${detail ? `  ${detail}` : ''}`);
}

/** Cierre del comando. */
export function printOutro(message: string) {
  p.outro(message);
}

/** Cierre cuando el usuario decide no seguir. Todas las preguntas van antes de escribir. */
export function printCancelled() {
  p.cancel('Cancelado: no se escribió nada.');
}

/** Recuadro con información (links, respaldo, comandos para repetir o deshacer). */
export function printNote(lines: string[], title: string) {
  p.note(lines.join('\n'), title);
}

/** Con animaciones (spinners, barras) solo si es una terminal y no se pidió --verbose. */
export const shouldAnimate = (verbose: boolean) => !verbose && Boolean(process.stdout.isTTY);

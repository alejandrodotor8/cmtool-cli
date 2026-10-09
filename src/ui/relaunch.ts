import { spawnSync } from 'node:child_process';

/**
 * Abierta desde Finder, la cfm.app no tiene una terminal donde preguntar: el ejecutable se
 * vuelve a abrir en una terminal (y este proceso termina). Solo desde la .app, en macOS,
 * sin argumentos y sin terminal; corrido desde una terminal, nunca.
 */
export const opensInTerminal = (
  platform: NodeJS.Platform,
  execPath: string,
  argv: string[],
  interactive: boolean,
): boolean => platform === 'darwin' && !interactive && argv.length === 0 && execPath.includes('.app/Contents/MacOS/');

/** Corre un comando y devuelve su código de salida. */
type Run = (command: string, args: string[]) => number | null;
const runCommand: Run = (command, args) => spawnSync(command, args, { stdio: 'ignore' }).status;

/**
 * Abre el ejecutable en la terminal que el usuario usa para abrir ejecutables (la que eligió en
 * Finder: Warp, iTerm…; por defecto, Terminal). Si eso falla, en Terminal. Con `open` no hace
 * falta el permiso de "controlar Terminal" que pediría AppleScript.
 */
export function openInTerminal(execPath: string, run: Run = runCommand): void {
  if (run('open', [execPath]) !== 0) run('open', ['-a', 'Terminal', execPath]);
}

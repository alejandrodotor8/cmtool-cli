/**
 * Entrada de los ejecutables de un solo archivo (script `build:release`), que no necesitan Node.
 * Corren igual que el build. En Windows, al abrirlos con doble clic, esperan un Enter antes de
 * cerrar; en macOS, la cfm.app abierta desde Finder se vuelve a abrir en la terminal del usuario.
 */
import { run } from './cli.ts';
import { pausesOnExit } from './ui/pause.ts';
import { openInTerminal, opensInTerminal } from './ui/relaunch.ts';

const argv = process.argv.slice(2);
const interactive = Boolean(process.stdin.isTTY);

if (opensInTerminal(process.platform, process.execPath, argv, interactive)) {
  openInTerminal(process.execPath);
} else {
  await run(argv, 'build', { pauseOnExit: pausesOnExit(process.platform, argv, interactive) });
}

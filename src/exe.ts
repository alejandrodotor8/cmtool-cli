/**
 * Entrada de los ejecutables de un solo archivo (script `build:exe`), que no necesitan Node.
 * Corren igual que el build; en Windows, al abrirlos con doble clic, esperan un Enter antes de cerrar.
 */
import { run } from './cli.ts';
import { pausesOnExit } from './ui/pause.ts';

const argv = process.argv.slice(2);
await run(argv, 'build', { pauseOnExit: pausesOnExit(process.platform, argv, Boolean(process.stdin.isTTY)) });

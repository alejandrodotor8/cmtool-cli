import { parseArgs } from 'node:util';
import { AbortError } from './errors.ts';

export interface CliArgs {
  command: 'migrate' | 'restore';
  /** Muestra el análisis y el plan sin escribir nada. */
  dryRun: boolean;
  help: boolean;
  /** Para `restore`: archivo de respaldo. Si falta, se elige de una lista. */
  file: string | undefined;
}

export const USAGE = `Uso:
  ctf-migrate                       migra entries entre ambientes
  ctf-migrate restore [respaldo]    deshace una migración usando su respaldo

Opciones:
  --dry-run    muestra el análisis y el plan, sin escribir nada
  -h, --help   muestra esta ayuda`;

const HELP_HINT = 'Corre ctf-migrate --help para ver las opciones.';

export function parseCliArgs(argv: string[]): CliArgs {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch (e) {
    throw new AbortError(e instanceof Error ? e.message : String(e), HELP_HINT);
  }

  const [command = 'migrate', file, ...extra] = parsed.positionals;
  if (command !== 'migrate' && command !== 'restore') {
    throw new AbortError(`Comando desconocido: "${command}".`, HELP_HINT);
  }
  const unexpected = command === 'migrate' ? [file, ...extra].filter(Boolean) : extra;
  if (unexpected.length) throw new AbortError(`Argumentos de más: ${unexpected.join(' ')}`, HELP_HINT);

  return {
    command,
    dryRun: parsed.values['dry-run'],
    help: parsed.values.help,
    file: command === 'restore' ? file : undefined,
  };
}

const parse = (args: string[]) =>
  parseArgs({
    args,
    allowPositionals: true,
    options: {
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

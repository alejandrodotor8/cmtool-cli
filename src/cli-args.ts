import { parseArgs } from 'node:util';
import { parseEntryIds } from './core/ids.ts';
import { AbortError } from './errors.ts';

export interface CliArgs {
  command: 'migrate' | 'restore';
  /** Muestra el análisis y el plan sin escribir nada. */
  dryRun: boolean;
  /** Muestra cada llamada a la API. */
  verbose: boolean;
  help: boolean;
  /** Para `restore`: archivo de respaldo. Si falta, se elige de una lista. */
  file: string | undefined;
  /** Para `migrate`: lo que se pasa por flags no se pregunta. */
  space: string | undefined;
  from: string | undefined;
  to: string | undefined;
  ids: string[] | undefined;
}

export const USAGE = `Uso:
  ctf-migrate [opciones]                     migra entries entre ambientes
  ctf-migrate restore [respaldo] [opciones]  deshace una migración usando su respaldo

Para no elegir en los menús (migrate):
  --space <id>     space
  --from <env>     ambiente origen (acepta aliases)
  --to <env>       ambiente destino (acepta aliases)
  --ids <a,b,c>    entry IDs (o URLs de entries), separados por coma

Opciones:
  --dry-run        muestra el análisis y el plan, sin escribir nada
  --verbose        muestra cada llamada a la API
  -h, --help       muestra esta ayuda

Las preguntas de imágenes, modelo y la confirmación final siempre se hacen.`;

const HELP_HINT = 'Corre ctf-migrate --help para ver las opciones.';
const MIGRATE_ONLY = ['space', 'from', 'to', 'ids'] as const;

const parse = (args: string[]) =>
  parseArgs({
    args,
    allowPositionals: true,
    options: {
      'dry-run': { type: 'boolean', default: false },
      verbose: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      space: { type: 'string' },
      from: { type: 'string' },
      to: { type: 'string' },
      ids: { type: 'string' },
    },
  });

export function parseCliArgs(argv: string[]): CliArgs {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch (e) {
    throw new AbortError(e instanceof Error ? e.message : String(e), HELP_HINT);
  }
  const { values, positionals } = parsed;

  const [command = 'migrate', file, ...extra] = positionals;
  if (command !== 'migrate' && command !== 'restore') {
    throw new AbortError(`Comando desconocido: "${command}".`, HELP_HINT);
  }
  const unexpected = command === 'migrate' ? [file, ...extra].filter(Boolean) : extra;
  if (unexpected.length) throw new AbortError(`Argumentos de más: ${unexpected.join(' ')}`, HELP_HINT);

  if (command === 'restore') {
    const misplaced = MIGRATE_ONLY.filter((name) => values[name] !== undefined);
    if (misplaced.length) {
      throw new AbortError(`--${misplaced.join(', --')} solo sirve(n) para migrar, no para restore.`, HELP_HINT);
    }
  }
  for (const name of MIGRATE_ONLY) {
    if (values[name] !== undefined && !values[name].trim()) throw new AbortError(`--${name} está vacío.`, HELP_HINT);
  }

  const parsedIds = values.ids === undefined ? undefined : parseEntryIds(values.ids);
  if (parsedIds?.invalid.length) {
    throw new AbortError(`--ids tiene valores que no son entry IDs: ${parsedIds.invalid.join(', ')}`, HELP_HINT);
  }
  const ids = parsedIds?.ids;
  if (ids && !ids.length) throw new AbortError('--ids no tiene ningún entry ID.', HELP_HINT);

  return {
    command,
    dryRun: values['dry-run'],
    verbose: values.verbose,
    help: values.help,
    file: command === 'restore' ? file : undefined,
    space: values.space?.trim(),
    from: values.from?.trim(),
    to: values.to?.trim(),
    ids,
  };
}

/** El comando equivalente con flags, para repetir una migración sin pasar por los menús. */
export function repeatCommand({
  spaceId,
  src,
  dst,
  rootIds,
}: {
  spaceId: string;
  src: string;
  dst: string;
  rootIds: string[];
}) {
  return `ctf-migrate --space ${spaceId} --from ${src} --to ${dst} --ids ${rootIds.join(',')}`;
}

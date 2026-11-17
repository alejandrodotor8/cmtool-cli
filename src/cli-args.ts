/**
 * Comandos y flags: una sola definición de la que salen el menú, la ayuda y la validación.
 */
import { parseArgs } from 'node:util';
import { AbortError, type Decision, formatDecision, parseDecision, parseEntryIds, parseSince } from 'cmtool-core';
import { APP_NAME, VERSION } from './app.ts';

/** Comandos, en el orden del menú. */
export const COMMANDS = {
  migrate: { label: 'Migrar entries', hint: 'copiar contenido de un ambiente a otro' },
  'migrate-model': { label: 'Migrar modelo', hint: 'solo content types y campos, sin contenido' },
  'migrate-assets': { label: 'Migrar imágenes y archivos', hint: 'assets sueltos, sin entries' },
  'compare-models': { label: 'Comparar modelos', hint: 'diferencias entre ambientes · solo lectura' },
  'compare-entry': { label: 'Comparar entries', hint: 'campo por campo entre ambientes · solo lectura' },
  status: { label: 'Estado de los ambientes', hint: 'resumen de diferencias · solo lectura' },
  history: { label: 'Historial', hint: 'migraciones anteriores y sus respaldos' },
  restore: { label: 'Deshacer una migración', hint: 'con su respaldo' },
  login: { label: 'Iniciar sesión', hint: 'pegar o cambiar tu token de Contentful' },
  logout: { label: 'Cerrar sesión', hint: 'borrar el token guardado en este equipo' },
} as const;

export type Command = keyof typeof COMMANDS;
const isCommand = (value: string): value is Command => Object.hasOwn(COMMANDS, value);

const BETWEEN_ENVS: Command[] = [
  'migrate',
  'migrate-model',
  'migrate-assets',
  'compare-models',
  'compare-entry',
  'status',
];
const PICKS_ENTRIES: Command[] = ['migrate', 'compare-entry'];
const WRITES: Command[] = ['migrate', 'migrate-model', 'migrate-assets', 'restore'];
const REPORTS: Command[] = ['compare-models', 'compare-entry', 'status'];

interface FlagSpec {
  type: 'string' | 'boolean';
  short?: string;
  /** Cómo se escribe el valor en la ayuda. */
  arg?: string;
  help: string;
  group: 'Ambientes' | 'Elegir entries' | 'Decisiones (no pregunta)' | 'Salida' | 'General';
  /** Comandos que la aceptan; `global` = todos. */
  commands: Command[] | 'global';
}

/** Flags. Elegir entries con flags reemplaza las preguntas y lleva directo a `migrate`. */
export const FLAGS = {
  space: { type: 'string', arg: '<id>', help: 'space', group: 'Ambientes', commands: BETWEEN_ENVS },
  from: {
    type: 'string',
    arg: '<env>',
    help: 'ambiente origen (ID o alias)',
    group: 'Ambientes',
    commands: BETWEEN_ENVS,
  },
  to: {
    type: 'string',
    arg: '<env>',
    help: 'ambiente destino (ID o alias)',
    group: 'Ambientes',
    commands: BETWEEN_ENVS,
  },
  ids: {
    type: 'string',
    arg: '<a,b>',
    help: 'IDs o URLs (entries; en migrate-assets, assets)',
    group: 'Elegir entries',
    commands: [...PICKS_ENTRIES, 'migrate-assets'],
  },
  'ids-file': {
    type: 'string',
    arg: '<archivo>',
    help: 'archivo con entry IDs (uno por línea, CSV o columna de Excel)',
    group: 'Elegir entries',
    commands: PICKS_ENTRIES,
  },
  search: {
    type: 'string',
    arg: '<texto>',
    help: 'buscar por texto',
    group: 'Elegir entries',
    commands: [...PICKS_ENTRIES, 'migrate-assets'],
  },
  'content-type': {
    type: 'string',
    arg: '<id,id>',
    help: 'content type(s)',
    group: 'Elegir entries',
    commands: [...PICKS_ENTRIES, 'migrate-model', 'compare-models'],
  },
  tag: { type: 'string', arg: '<id>', help: 'entries con este tag', group: 'Elegir entries', commands: PICKS_ENTRIES },
  since: {
    type: 'string',
    arg: '<hoy|7d|AAAA-MM-DD>',
    help: 'cambiadas desde',
    group: 'Elegir entries',
    commands: PICKS_ENTRIES,
  },
  mine: { type: 'boolean', help: 'solo las que editaste tú', group: 'Elegir entries', commands: PICKS_ENTRIES },
  missing: {
    type: 'boolean',
    help: 'las que faltan en destino (por content type)',
    group: 'Elegir entries',
    commands: ['migrate'],
  },
  update: {
    type: 'string',
    arg: '<all|none|id,id>',
    help: 'qué entries que ya existen en destino actualizar',
    group: 'Decisiones (no pregunta)',
    commands: ['migrate'],
  },
  assets: {
    type: 'boolean',
    help: 'crear las imágenes que faltan (--no-assets: no crearlas)',
    group: 'Decisiones (no pregunta)',
    commands: ['migrate'],
  },
  model: {
    type: 'string',
    arg: '<all|none|cambios>',
    help: 'qué cambios de modelo aplicar (como los escribe "Repetir")',
    group: 'Decisiones (no pregunta)',
    commands: ['migrate', 'migrate-model'],
  },
  report: {
    type: 'string',
    arg: '<archivo.md>',
    help: 'guarda un reporte Markdown',
    group: 'Salida',
    commands: REPORTS,
  },
  'dry-run': { type: 'boolean', help: 'muestra el plan sin escribir nada', group: 'Salida', commands: WRITES },
  verbose: {
    type: 'boolean',
    help: 'muestra cada llamada a la API',
    group: 'Salida',
    commands: [...BETWEEN_ENVS, 'restore', 'history'],
  },
  version: { type: 'boolean', short: 'v', help: 'muestra la versión', group: 'General', commands: 'global' },
  help: { type: 'boolean', short: 'h', help: 'muestra esta ayuda', group: 'General', commands: 'global' },
} as const satisfies Record<string, FlagSpec>;

type FlagName = keyof typeof FLAGS;

/** Flags que eligen entries: con ellas y sin comando, se asume `migrate`. */
const ENTRY_FLAGS: FlagName[] = ['ids', 'ids-file', 'search', 'content-type', 'tag', 'since', 'mine', 'missing'];

export interface CliArgs {
  /** `undefined`: se elige en el menú. */
  command: Command | undefined;
  dryRun: boolean;
  verbose: boolean;
  help: boolean;
  version: boolean;
  /** `restore`: archivo de respaldo. */
  file: string | undefined;
  space: string | undefined;
  from: string | undefined;
  to: string | undefined;
  ids: string[] | undefined;
  idsFile: string | undefined;
  search: string | undefined;
  contentTypes: string[] | undefined;
  tag: string | undefined;
  /** Fecha ISO. */
  since: string | undefined;
  mine: boolean;
  missing: boolean;
  /** Qué entries existentes actualizar (sin preguntar). */
  update: Decision | undefined;
  /** Crear las imágenes que faltan (`--assets` / `--no-assets`); `undefined`: preguntar. */
  assets: boolean | undefined;
  /** Qué cambios de modelo aplicar, por clave (sin preguntar). */
  model: Decision | undefined;
  report: string | undefined;
  /** Flags que se pasaron (para validar contra el comando elegido en el menú). */
  given: FlagName[];
}

const HELP_HINT = `Corre ${APP_NAME} --help para ver los comandos y las opciones.`;

const parse = (args: string[]) =>
  parseArgs({
    args,
    allowPositionals: true,
    allowNegative: true,
    options: Object.fromEntries(
      Object.entries(FLAGS).map(([name, f]) => [name, { type: f.type, ...('short' in f ? { short: f.short } : {}) }]),
    ) as { [K in FlagName]: { type: (typeof FLAGS)[K]['type'] } },
  });

const list = (value: string | undefined) =>
  value
    ?.split(',')
    .map((v) => v.trim())
    .filter(Boolean);

export function parseCliArgs(argv: string[]): CliArgs {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch (e) {
    throw new AbortError(e instanceof Error ? e.message : String(e), HELP_HINT);
  }
  const values = parsed.values as Record<FlagName, string | boolean | undefined>;
  // `--no-x` da false: también cuenta como pasado (para validar a qué comando sirve).
  const given = (Object.keys(FLAGS) as FlagName[]).filter((name) => values[name] !== undefined);

  const [first, file, ...extra] = parsed.positionals;
  if (first !== undefined && !isCommand(first)) throw new AbortError(`Comando desconocido: "${first}".`, HELP_HINT);
  const command = first ?? (given.some((f) => ENTRY_FLAGS.includes(f)) ? 'migrate' : undefined);
  const unexpected = command === 'restore' ? extra : [file, ...extra].filter(Boolean);
  if (unexpected.length) throw new AbortError(`Argumentos de más: ${unexpected.join(' ')}`, HELP_HINT);

  const text = (name: FlagName) => {
    const value = values[name];
    if (typeof value !== 'string') return undefined;
    if (!value.trim()) throw new AbortError(`--${name} está vacío.`, HELP_HINT);
    return value.trim();
  };

  const decision = (name: FlagName): Decision | undefined => {
    const value = text(name);
    if (value === undefined) return undefined;
    const parsedDecision = parseDecision(value);
    if (Array.isArray(parsedDecision) && !parsedDecision.length) {
      throw new AbortError(`--${name} no tiene ningún valor.`, HELP_HINT);
    }
    return parsedDecision;
  };

  let ids: string[] | undefined;
  const rawIds = text('ids');
  if (rawIds !== undefined) {
    const parsedIds = parseEntryIds(rawIds);
    if (parsedIds.invalid.length) {
      throw new AbortError(`--ids tiene valores que no son IDs: ${parsedIds.invalid.join(', ')}`, HELP_HINT);
    }
    if (!parsedIds.ids.length) throw new AbortError('--ids no tiene ningún ID.', HELP_HINT);
    ids = parsedIds.ids;
  }

  const rawSince = text('since');
  const since = rawSince === undefined ? undefined : parseSince(rawSince);
  if (rawSince !== undefined && !since) {
    throw new AbortError(`--since no se entiende: "${rawSince}". Usa hoy, 7d o AAAA-MM-DD.`, HELP_HINT);
  }

  const args: CliArgs = {
    command,
    dryRun: values['dry-run'] === true,
    verbose: values.verbose === true,
    help: values.help === true,
    version: values.version === true,
    file: command === 'restore' ? file : undefined,
    space: text('space'),
    from: text('from'),
    to: text('to'),
    ids,
    idsFile: text('ids-file'),
    search: text('search'),
    contentTypes: list(text('content-type')),
    tag: text('tag'),
    since,
    mine: values.mine === true,
    missing: values.missing === true,
    update: decision('update'),
    assets: typeof values.assets === 'boolean' ? values.assets : undefined,
    model: decision('model'),
    report: text('report'),
    given,
  };
  if (command) validateFlags(command, args);
  return args;
}

/** Revisa que cada flag que se pasó sirva para el comando. */
export function validateFlags(command: Command, args: Pick<CliArgs, 'given'>): void {
  const misplaced = args.given.filter((name) => {
    const accepted = FLAGS[name].commands;
    return accepted !== 'global' && !(accepted as readonly Command[]).includes(command);
  });
  if (misplaced.length) {
    throw new AbortError(`--${misplaced.join(', --')} no sirve(n) con "${command}".`, HELP_HINT);
  }
}

/** Lo que se eligió en una ejecución, para escribir el comando que la repite. */
export interface RepeatOptions {
  spaceId: string;
  src: string;
  dst: string;
  ids?: string[];
  contentTypes?: string[];
  update?: Decision;
  assets?: boolean;
  model?: Decision;
}

/**
 * El comando equivalente con flags: repite lo mismo sin pasar por los menús ni por las
 * preguntas que ya se respondieron (la confirmación final se hace siempre).
 */
export function repeatCommand(
  command: Command,
  { spaceId, src, dst, ids, contentTypes, update, assets, model }: RepeatOptions,
): string {
  return [
    APP_NAME,
    command,
    `--space ${spaceId}`,
    `--from ${src}`,
    `--to ${dst}`,
    ids?.length && `--ids ${ids.join(',')}`,
    contentTypes?.length && `--content-type ${contentTypes.join(',')}`,
    update && `--update ${formatDecision(update)}`,
    assets !== undefined && (assets ? '--assets' : '--no-assets'),
    model && `--model ${formatDecision(model)}`,
  ]
    .filter(Boolean)
    .join(' ');
}

/** Ayuda generada a partir de COMMANDS y FLAGS. */
export function usage(): string {
  const pad = (text: string, width: number) => text.padEnd(width);
  const commands = Object.entries(COMMANDS).map(([id, c]) => `  ${pad(id, 16)} ${c.label} — ${c.hint}`);
  const groups = new Map<string, string[]>();
  for (const [name, f] of Object.entries(FLAGS) as [FlagName, FlagSpec][]) {
    const flag = `${'short' in f && f.short ? `-${f.short}, ` : ''}--${name}${f.arg ? ` ${f.arg}` : ''}`;
    const where = f.commands === 'global' ? '' : `  (${f.commands.join(', ')})`;
    groups.set(f.group, [...(groups.get(f.group) ?? []), `  ${pad(flag, 30)} ${f.help}${where}`]);
  }
  return [
    `${APP_NAME} ${VERSION}`,
    '',
    'Uso:',
    `  ${APP_NAME}                       menú: elige qué hacer`,
    `  ${APP_NAME} <comando> [opciones]`,
    '',
    'Comandos:',
    ...commands,
    ...[...groups].flatMap(([group, lines]) => ['', `${group}:`, ...lines]),
    '',
    'Ejemplos:',
    `  ${APP_NAME} migrate --from develop --to qa --ids 5NIY0nRGNkKvvjO8yc8Pp1`,
    `  ${APP_NAME} migrate --from develop --to qa --since 7d --mine`,
    `  ${APP_NAME} compare-models --from develop --to qa --report modelos.md`,
    `  ${APP_NAME} migrate --from develop --to qa --ids 5NIY0nRGNkKvvjO8yc8Pp1 --update all --assets --model all`,
    '',
    'Al elegir, Esc vuelve a la pregunta anterior y Ctrl+C sale.',
    'Con --update, --assets/--no-assets y --model no se pregunta eso; la confirmación final se hace siempre.',
    'Cada comando muestra al final el comando "Repetir" con todo lo que elegiste.',
  ].join('\n');
}

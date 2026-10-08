/**
 * Lo que comparten los comandos: sesión, elección de space y ambientes, lecturas que se
 * hacen una sola vez, confirmación antes de escribir, respaldo y cierre.
 */

import pc from 'picocolors';
import type { Loaders } from '../analyze.ts';
import { APP_NAME } from '../app.ts';
import { type BackupData, startBackup } from '../backup.ts';
import type { CliArgs } from '../cli-args.ts';
import { createCma } from '../contentful/client.ts';
import {
  currentUser,
  listEnvironments,
  listSpaces,
  readContentTypes,
  readEditorInterfaces,
  readLocales,
} from '../contentful/read.ts';
import type { Account, Cma, ContentType, EditorInterface, Environment, Space } from '../contentful/types.ts';
import { createWriter } from '../contentful/write.ts';
import { remember } from '../core/cache.ts';
import { applyDecision, type Decision } from '../core/decision.ts';
import { looksLikeProduction, resolveEnvironment } from '../core/environments.ts';
import { allPicks, type ModelOption, type ModelPick, pickKey } from '../core/model-changes.ts';
import type { UpdateCandidate } from '../core/plan.ts';
import { AbortError } from '../errors.ts';
import type { WriteContext } from '../execute.ts';
import { loadSession } from '../session.ts';
import { trackApiCalls } from '../ui/api-calls.ts';
import { printCancelled, printNote, printOutro, shouldAnimate } from '../ui/header.ts';
import { log } from '../ui/log.ts';
import { type Step, steps } from '../ui/navigation.ts';
import { confirmWrite, pickDestination, pickSource, pickSpace } from '../ui/prompts.ts';
import { createRunner } from '../ui/runner.ts';
import { withStatus } from '../ui/status.ts';
import { renderRepeat } from '../ui/views/summary.ts';

/**
 * Sesión, contador de llamadas a la API, si se muestran animaciones, un cliente sin space
 * y lo que se lee una sola vez por ejecución: spaces, ambientes de cada space y la cuenta.
 */
function createSession(args: Pick<CliArgs, 'verbose'>) {
  const session = loadSession();
  const api = trackApiCalls(args.verbose);
  const animate = shouldAnimate(args.verbose);
  const client = createCma(session, undefined, api.onRequest);
  const cmaFor = remember(async (spaceId) => createCma(session, spaceId, api.onRequest));
  const spaces = remember(() => listSpaces(client));
  const environments = remember(async (spaceId) => listEnvironments(await cmaFor(spaceId)));
  const user = remember(() => currentUser(client));
  let account: Promise<Account> | undefined;
  return {
    session,
    api,
    animate,
    client,
    cmaFor,
    spaces: () => spaces(''),
    environments,
    user: () => user(''),
    account: (): Promise<Account> => {
      account ??= withStatus(
        'Verificando tu cuenta…',
        animate,
        async () => {
          const found = await user('');
          return { userId: found.id, email: found.email, host: session.host };
        },
        (a) => `Cuenta: ${a.email ?? a.userId}`,
      );
      return account;
    },
  };
}

let opened: ReturnType<typeof createSession> | undefined;

/** La sesión de esta ejecución (una sola: lo que se lee queda para todos los comandos y pasos). */
export function openSession(args: Pick<CliArgs, 'verbose'>): ReturnType<typeof createSession> {
  opened ??= createSession(args);
  return opened;
}

/**
 * Adelanta las primeras lecturas mientras el usuario mira el menú o la primera pregunta:
 * spaces y ambientes (o la cuenta, en history y restore). Así, al elegir, la conexión con
 * Contentful ya está abierta y los datos listos. No muestra nada y nunca falla: si algo
 * sale mal, se vuelve a intentar (y se informa) cuando de verdad hace falta.
 */
export function prefetch(args: Pick<CliArgs, 'verbose' | 'command' | 'space'>): void {
  if (args.verbose) return; // las líneas de --verbose se mezclarían con el menú
  let base: SessionContext;
  try {
    base = openSession(args);
  } catch {
    return; // sin sesión: el comando lo explica
  }
  if (args.command === 'history' || args.command === 'restore') {
    base.user().catch(() => {});
    return;
  }
  base
    .spaces()
    .then((found) => {
      const preferred = args.space ?? base.session.defaultSpaceId;
      const id = found.length === 1 ? found[0]?.sys.id : found.find((s) => s.sys.id === preferred)?.sys.id;
      if (id) return base.environments(id);
    })
    .catch(() => {});
}

export type SessionContext = ReturnType<typeof openSession>;

export interface Context extends SessionContext, Loaders {
  /** Apariencia del editor de todos los content types de un ambiente (1 llamada, memorizada). */
  editorInterfaces: (env: string) => Promise<Map<string, EditorInterface>>;
  cma: Cma;
  spaceId: string;
  src: string;
  dst: string;
  dstEnv: Environment;
}

/** Aplica una decisión pasada por flag y avisa lo que ya no está disponible. */
function decide(available: string[], decision: Decision, flag: string): Set<string> {
  const { chosen, unknown } = applyDecision(available, decision);
  if (unknown.length) log.warn(`--${flag}: ya no hay nada que hacer con ${unknown.join(', ')}.`);
  log.info(`--${flag}: ${chosen.length} de ${available.length}, sin preguntar`);
  return new Set(chosen);
}

/** `--update`: qué entries existentes actualizar, sin preguntar. */
export const updatesFromFlag = (candidates: UpdateCandidate[], decision: Decision): string[] => [
  ...decide(
    candidates.map((c) => c.id),
    decision,
    'update',
  ),
];

/** `--model`: qué cambios de modelo aplicar, sin preguntar. */
export function modelPicksFromFlag(options: ModelOption[], decision: Decision): ModelPick[] {
  const available = allPicks(options);
  const keys = decide(available.map(pickKey), decision, 'model');
  return available.filter((pick) => keys.has(pickKey(pick)));
}

/** Ambiente pasado por flag (ID o alias); si no existe, se detiene. */
function requireEnvironment(envs: Environment[], name: string): string {
  const id = resolveEnvironment(envs, name);
  if (!id) throw new AbortError(`El ambiente "${name}" no existe en este space.`);
  return id;
}

/**
 * Pasos para elegir space, origen y destino (de los flags o preguntando), para que los
 * comandos los pongan al principio de su flujo: así Esc vuelve de una pregunta a otra.
 * `ctx()` devuelve el contexto una vez que corrieron.
 */
export function contextSteps(args: CliArgs): { steps: Step[]; ctx: () => Context } {
  const base = openSession(args);
  const { session, animate } = base;
  let spaceId = '';
  let src = '';
  let dst = '';
  let cma: Cma | undefined;
  let context: Context | undefined;

  // Lo que se lee queda en la sesión: volver atrás no repite llamadas.
  const environments = (id: string) =>
    withStatus(
      'Leyendo ambientes…',
      animate,
      () => base.environments(id),
      (found) => `${found.length} ambientes`,
    );

  const steps: Step[] = [
    async () => {
      const found = await withStatus(
        'Conectando con Contentful…',
        animate,
        () => base.spaces(),
        (list) => `Conectado · ${list.length} space(s)`,
      );
      if (!found.length) throw new AbortError('Tu usuario no tiene acceso a ningún space.');
      if (args.space && !found.some((s) => s.sys.id === args.space)) {
        throw new AbortError(`No tienes acceso al space "${args.space}".`);
      }
      spaceId =
        args.space ??
        (found.length === 1 ? (found[0] as Space).sys.id : await pickSpace(found, session.defaultSpaceId));
      cma = await base.cmaFor(spaceId);
    },
    async () => {
      const envs = await environments(spaceId);
      if (envs.length < 2) throw new AbortError('Este space tiene un solo ambiente; no hay con qué comparar.');
      if (args.from) {
        src = requireEnvironment(envs, args.from);
        const env = envs.find((e) => e.id === src);
        if (env && looksLikeProduction(env)) log.warn(`Origen ${pc.bold(src)}: parece producción.`);
      } else {
        src = await pickSource(envs);
      }
    },
    async () => {
      const envs = await environments(spaceId);
      dst = args.to ? requireEnvironment(envs, args.to) : await pickDestination(envs, src);
      if (src === dst) throw new AbortError('Origen y destino son el mismo ambiente.');
      context = buildContext(base, { cma: cma as Cma, spaceId, src, dst, envs });
    },
  ];
  return {
    steps,
    ctx: () => {
      if (!context) throw new Error('contextSteps: el contexto todavía no está listo');
      return context;
    },
  };
}

/** Space, origen y destino, para un comando que no necesita volver más allá de esto. */
export async function openContext(args: CliArgs): Promise<Context> {
  const { steps: list, ctx } = contextSteps(args);
  await steps(list);
  return ctx();
}

/** Contexto a partir de sus partes (también lo usa restore, que toma space y ambientes del respaldo). */
export function buildContext(
  base: SessionContext,
  { cma, spaceId, src, dst, envs }: { cma: Cma; spaceId: string; src: string; dst: string; envs: Environment[] },
): Context {
  return {
    ...base,
    cma,
    spaceId,
    src,
    dst,
    dstEnv: envs.find((e) => e.id === dst) ?? { id: dst, aliases: [] },
    contentTypes: remember((env) => readContentTypes(cma, env)),
    locales: remember((env) => readLocales(cma, env)),
    editorInterfaces: remember((env) => readEditorInterfaces(cma, env)),
  };
}

/** Modelos de origen y destino (2 llamadas la primera vez). */
export function loadModels(ctx: Context): Promise<[Map<string, ContentType>, Map<string, ContentType>]> {
  return withStatus(
    'Leyendo modelos…',
    ctx.animate,
    () => Promise.all([ctx.contentTypes(ctx.src), ctx.contentTypes(ctx.dst)]),
    ([src, dst]) => `${src.size} content types en ${ctx.src} · ${dst.size} en ${ctx.dst}`,
  );
}

/** Apariencia del editor de origen y destino (2 llamadas la primera vez). */
export function loadEditors(ctx: Context): Promise<[Map<string, EditorInterface>, Map<string, EditorInterface>]> {
  return withStatus(
    'Leyendo la apariencia del editor…',
    ctx.animate,
    () => Promise.all([ctx.editorInterfaces(ctx.src), ctx.editorInterfaces(ctx.dst)]),
    () => 'Apariencia del editor leída',
  );
}

/** Los content types pasados con --content-type tienen que existir en origen o destino. */
export function requireContentTypes(ids: string[] | undefined, ...models: Map<string, ContentType>[]): void {
  const unknown = (ids ?? []).filter((id) => !models.some((m) => m.has(id)));
  if (unknown.length) throw new AbortError(`Estos content types no existen: ${unknown.join(', ')}`);
}

/** Pregunta antes de escribir (con la confirmación reforzada en producción). `false` si el usuario no sigue. */
export async function confirmWriting(ctx: Context, question: string): Promise<boolean> {
  if (await confirmWrite(ctx.dstEnv, question)) return true;
  printCancelled();
  return false;
}

/** Respaldo (en la carpeta de la cuenta), writer y runner para empezar a escribir en destino. */
export async function startWriting(
  ctx: Context,
  kind: BackupData['kind'],
  rootIds: string[] = [],
): Promise<WriteContext> {
  const account = await ctx.account();
  return {
    writer: createWriter(ctx.cma, { src: ctx.src, dst: ctx.dst }),
    backup: startBackup({ kind, account, spaceId: ctx.spaceId, src: ctx.src, dst: ctx.dst, rootIds }),
    runner: createRunner({ animate: ctx.animate }),
  };
}

/** Cierre después de escribir: recuadro con respaldo y llamadas, y mensaje final. Devuelve el código de salida. */
export function finishWriting(
  ctx: SessionContext,
  { backup, runner }: Pick<WriteContext, 'backup' | 'runner'>,
  { title, lines = [], repeat, done }: { title: string; lines?: string[]; repeat?: string; done: string },
): number {
  const failed = runner.failures.length;
  printNote(
    [
      ...lines,
      ...(lines.length ? [''] : []),
      ...(repeat ? [`${pc.bold('Repetir')}       ${repeat}`] : []),
      `${pc.bold('Respaldo')}      ${backup.file}`,
      `${pc.bold('Deshacer')}      ${APP_NAME} restore`,
      `${pc.bold('Llamadas API')}  ${ctx.api.count}`,
    ],
    failed ? 'Terminado con errores' : title,
  );
  printOutro(failed ? pc.red(`Terminado con ${failed} error(es).`) : pc.green(done));
  return failed ? 1 : 0;
}

/** Cierre de un --dry-run. */
export function finishDryRun(ctx: SessionContext, lines: string[] = []): number {
  printNote([...lines, ...(lines.length ? [''] : []), pc.dim(`Llamadas a la API: ${ctx.api.count}`)], 'Modo --dry-run');
  printOutro('No se escribió nada.');
  return 0;
}

/** Cierre de un comando de solo lectura; con `repeat`, muestra el comando para repetirlo. */
export function finishReading(ctx: SessionContext, message: string, repeat?: string): number {
  if (repeat) renderRepeat(repeat);
  printOutro(`${message} ${pc.dim(`· ${ctx.api.count} llamadas a la API`)}`);
  return 0;
}

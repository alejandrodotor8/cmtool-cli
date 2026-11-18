/**
 * Lo que comparten los comandos: sesión, elección de space y ambientes, lecturas que se
 * hacen una sola vez, confirmación antes de escribir, respaldo y cierre.
 */

import {
  AbortError,
  type Account,
  type BackupData,
  type ContentType,
  connect,
  type Decision,
  type Environment,
  type Envs,
  looksLikeProduction,
  type MigrationTree,
  type ModelChoices,
  type ModelPick,
  resolveEnvironment,
  type Space,
  type SpaceConnection,
  type WriteTools,
} from 'cmtool-core';
import { startBackup } from 'cmtool-core/node';
import pc from 'picocolors';
import { APP_NAME } from '../app.ts';
import type { CliArgs } from '../cli-args.ts';
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
 * Sesión, contador de llamadas a la API, si se muestran animaciones y la conexión con
 * Contentful, que lee una sola vez por ejecución lo que se vuelve a pedir (spaces, ambientes,
 * modelos…).
 */
function createSession(args: Pick<CliArgs, 'verbose'>) {
  const session = loadSession();
  const api = trackApiCalls(args.verbose);
  const animate = shouldAnimate(args.verbose);
  const contentful = connect(session, { onRequest: api.onRequest });
  let account: Promise<Account> | undefined;
  return {
    session,
    api,
    animate,
    contentful,
    /** La cuenta, con su mensaje la primera vez que se pide. */
    account: (): Promise<Account> => {
      account ??= withStatus(
        'Verificando tu cuenta…',
        animate,
        () => contentful.account(),
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
  const { contentful } = base;
  if (args.command === 'history' || args.command === 'restore') {
    contentful.account().catch(() => {});
    return;
  }
  contentful
    .spaces()
    .then((found) => {
      const preferred = args.space ?? base.session.defaultSpaceId;
      const id = found.length === 1 ? found[0]?.sys.id : found.find((s) => s.sys.id === preferred)?.sys.id;
      if (id) return contentful.space(id).environments();
    })
    .catch(() => {});
}

export type SessionContext = ReturnType<typeof openSession>;

/** Space, origen y destino elegidos, con la sesión. Las lecturas del space ya quedan guardadas en `space`. */
export interface Context extends SessionContext, Envs {
  space: SpaceConnection;
  spaceId: string;
  dstEnv: Environment;
}

/** Cuenta lo que eligió un flag y avisa lo que ya no está disponible. */
function reportFlag(flag: string, chosen: number, available: number, unknown: string[]): void {
  if (unknown.length) log.warn(`--${flag}: ya no hay nada que hacer con ${unknown.join(', ')}.`);
  log.info(`--${flag}: ${chosen} de ${available}, sin preguntar`);
}

/** `--update`: qué entries existentes actualizar, sin preguntar. */
export function updatesFromFlag(tree: MigrationTree, decision: Decision): Set<string> {
  const { chosen, unknown } = tree.applyUpdateDecision(decision);
  reportFlag('update', chosen.size, tree.candidates.length, unknown);
  return chosen;
}

/** `--model`: qué cambios de modelo aplicar, sin preguntar. */
export function modelPicksFromFlag(choices: ModelChoices, decision: Decision): ModelPick[] {
  const { picked, unknown } = choices.apply(decision);
  reportFlag('model', picked.length, choices.all.length, unknown);
  return picked;
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
  const { session, animate, contentful } = base;
  let spaceId = '';
  let src = '';
  let dst = '';
  let context: Context | undefined;

  // Lo que se lee queda en la conexión: volver atrás no repite llamadas.
  const environments = (id: string) =>
    withStatus(
      'Leyendo ambientes…',
      animate,
      () => contentful.space(id).environments(),
      (found) => `${found.length} ambientes`,
    );

  const steps: Step[] = [
    async () => {
      const found = await withStatus(
        'Conectando con Contentful…',
        animate,
        () => contentful.spaces(),
        (list) => `Conectado · ${list.length} space(s)`,
      );
      if (!found.length) throw new AbortError('Tu usuario no tiene acceso a ningún space.');
      if (args.space && !found.some((s) => s.sys.id === args.space)) {
        throw new AbortError(`No tienes acceso al space "${args.space}".`);
      }
      spaceId =
        args.space ??
        (found.length === 1 ? (found[0] as Space).sys.id : await pickSpace(found, session.defaultSpaceId));
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
      context = buildContext(base, { spaceId, src, dst, envs });
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
  { spaceId, src, dst, envs }: { spaceId: string; src: string; dst: string; envs: Environment[] },
): Context {
  return {
    ...base,
    space: base.contentful.space(spaceId),
    spaceId,
    src,
    dst,
    dstEnv: envs.find((e) => e.id === dst) ?? { id: dst, aliases: [] },
  };
}

/** Modelos de origen y destino (2 llamadas la primera vez). */
export function loadModels(ctx: Context): Promise<[Map<string, ContentType>, Map<string, ContentType>]> {
  return withStatus(
    'Leyendo modelos…',
    ctx.animate,
    () => Promise.all([ctx.space.contentTypes(ctx.src), ctx.space.contentTypes(ctx.dst)]),
    ([src, dst]) => `${src.size} content types en ${ctx.src} · ${dst.size} en ${ctx.dst}`,
  );
}

/** Pregunta antes de escribir (con la confirmación reforzada en producción). `false` si el usuario no sigue. */
export async function confirmWriting(ctx: Context, question: string): Promise<boolean> {
  if (await confirmWrite(ctx.dstEnv, question)) return true;
  printCancelled();
  return false;
}

/** Con qué escribe el CLI: el respaldo va a un archivo (su ruta se muestra al terminar) y el avance, a la terminal. */
export type FileWriteTools = WriteTools & { backup: ReturnType<typeof startBackup> };

/** Respaldo (en la carpeta de la cuenta) y runner para empezar a escribir. El writer lo pone cada migración. */
export async function startWriting(
  ctx: Context,
  kind: BackupData['kind'],
  rootIds: string[] = [],
): Promise<FileWriteTools> {
  const account = await ctx.account();
  return {
    backup: startBackup({ kind, account, spaceId: ctx.spaceId, src: ctx.src, dst: ctx.dst, rootIds }),
    runner: createRunner({ animate: ctx.animate }),
  };
}

/** Cierre después de escribir: recuadro con respaldo y llamadas, y mensaje final. Devuelve el código de salida. */
export function finishWriting(
  ctx: SessionContext,
  { backup, runner }: FileWriteTools,
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

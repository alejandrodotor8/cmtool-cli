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
import { listEnvironments, listSpaces, readContentTypes, readLocales } from '../contentful/read.ts';
import type { Cma, ContentType, Environment } from '../contentful/types.ts';
import { createWriter } from '../contentful/write.ts';
import { resolveEnvironment } from '../core/environments.ts';
import { AbortError } from '../errors.ts';
import type { WriteContext } from '../execute.ts';
import { loadSession } from '../session.ts';
import { trackApiCalls } from '../ui/api-calls.ts';
import { printCancelled, printNote, printOutro, shouldAnimate } from '../ui/header.ts';
import { confirmWrite, pickDestination, pickSource, pickSpace } from '../ui/prompts.ts';
import { createRunner } from '../ui/runner.ts';
import { withStatus } from '../ui/status.ts';

/** Sesión, contador de llamadas a la API y si se muestran animaciones. */
export function openSession(args: Pick<CliArgs, 'verbose'>) {
  return { session: loadSession(), api: trackApiCalls(args.verbose), animate: shouldAnimate(args.verbose) };
}

export type SessionContext = ReturnType<typeof openSession>;

export interface Context extends SessionContext, Loaders {
  cma: Cma;
  spaceId: string;
  src: string;
  dst: string;
  dstEnv: Environment;
}

/** Guarda el resultado de cada llamada (por ambiente) para no repetirla. */
function memo<T>(load: (env: string) => Promise<T>): (env: string) => Promise<T> {
  const cache = new Map<string, Promise<T>>();
  return (env) => {
    if (!cache.has(env)) cache.set(env, load(env));
    return cache.get(env) as Promise<T>;
  };
}

/** Ambiente pasado por flag (ID o alias); si no existe, se detiene. */
function requireEnvironment(envs: Environment[], name: string): string {
  const id = resolveEnvironment(envs, name);
  if (!id) throw new AbortError(`El ambiente "${name}" no existe en este space.`);
  return id;
}

/** Space, origen y destino: de los flags o preguntando. */
export async function openContext(args: CliArgs): Promise<Context> {
  const base = openSession(args);
  const { session, api, animate } = base;

  const spaces = await withStatus(
    'Conectando con Contentful…',
    animate,
    () => listSpaces(createCma(session, undefined, api.onRequest)),
    (found) => `Conectado · ${found.length} space(s)`,
  );
  if (!spaces.length) throw new AbortError('Tu usuario no tiene acceso a ningún space.');
  if (args.space && !spaces.some((s) => s.sys.id === args.space)) {
    throw new AbortError(`No tienes acceso al space "${args.space}".`);
  }
  const spaceId = args.space ?? (await pickSpace(spaces, session.defaultSpaceId));
  const cma = createCma(session, spaceId, api.onRequest);

  const envs = await withStatus(
    'Leyendo ambientes…',
    animate,
    () => listEnvironments(cma),
    (found) => `${found.length} ambientes`,
  );
  if (envs.length < 2) throw new AbortError('Este space tiene un solo ambiente; no hay con qué comparar.');
  const src = args.from ? requireEnvironment(envs, args.from) : await pickSource(envs);
  const dst = args.to ? requireEnvironment(envs, args.to) : await pickDestination(envs, src);
  if (src === dst) throw new AbortError('Origen y destino son el mismo ambiente.');

  return buildContext(base, { cma, spaceId, src, dst, envs });
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
    contentTypes: memo((env) => readContentTypes(cma, env)),
    locales: memo((env) => readLocales(cma, env)),
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

/** Respaldo, writer y runner para empezar a escribir en destino. */
export function startWriting(ctx: Context, kind: BackupData['kind'], rootIds: string[] = []): WriteContext {
  return {
    writer: createWriter(ctx.cma, { src: ctx.src, dst: ctx.dst }),
    backup: startBackup({ kind, spaceId: ctx.spaceId, src: ctx.src, dst: ctx.dst, rootIds }),
    runner: createRunner({ animate: ctx.animate }),
  };
}

/** Cierre después de escribir: recuadro con respaldo y llamadas, y mensaje final. Devuelve el código de salida. */
export function finishWriting(
  ctx: SessionContext,
  { backup, runner }: Pick<WriteContext, 'backup' | 'runner'>,
  { title, lines = [], done }: { title: string; lines?: string[]; done: string },
): number {
  const failed = runner.failures.length;
  printNote(
    [
      ...lines,
      ...(lines.length ? [''] : []),
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

/** Cierre de un comando de solo lectura. */
export function finishReading(ctx: SessionContext, message: string): number {
  printOutro(`${message} ${pc.dim(`· ${ctx.api.count} llamadas a la API`)}`);
  return 0;
}

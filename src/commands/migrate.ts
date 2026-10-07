/**
 * `ctf-migrate`: migra entries de un ambiente a otro.
 *   1. elegir space, origen, destino y entries;
 *   2. analizar (solo lectura);
 *   3. mostrar y decidir (imágenes, modelo);
 *   4. confirmar, respaldar y escribir en destino.
 */
import pc from 'picocolors';
import { analyze, changesSinceAnalysis } from '../analyze.ts';
import { startBackup } from '../backup.ts';
import { type CliArgs, repeatCommand } from '../cli-args.ts';
import { LIMITS } from '../config.ts';
import { createCma } from '../contentful/client.ts';
import { listEnvironments, listSpaces } from '../contentful/read.ts';
import type { Environment } from '../contentful/types.ts';
import { createWriter } from '../contentful/write.ts';
import { resolveEnvironment } from '../core/environments.ts';
import { brokenHyperlinks, buildPlan, isWrite, modelOptions } from '../core/plan.ts';
import { requiredGaps } from '../core/publish-check.ts';
import { AbortError } from '../errors.ts';
import { executePlan } from '../execute.ts';
import { loadSession } from '../session.ts';
import { trackApiCalls } from '../ui/api-calls.ts';
import { printHeader, type RunMode } from '../ui/header.ts';
import { log } from '../ui/log.ts';
import {
  askEntryIds,
  askModelChanges,
  askWithAssets,
  confirmLargeMigration,
  confirmWrite,
  pickDestination,
  pickSource,
  pickSpace,
} from '../ui/prompts.ts';
import { renderAssets, renderEntryTree, renderModel, renderSummary } from '../ui/views.ts';

export async function migrate(args: CliArgs, mode: RunMode): Promise<number> {
  const { dryRun } = args;
  printHeader('Contentful · migrar entries entre ambientes', {
    dryRun,
    mode,
    note: 'entries e imágenes quedan en draft',
  });

  // 1. Qué migrar y hacia dónde
  const session = loadSession();
  const api = trackApiCalls(args.verbose);
  const spaces = await listSpaces(createCma(session, undefined, api.onRequest));
  if (!spaces.length) throw new AbortError('Tu usuario no tiene acceso a ningún space.');
  if (args.space && !spaces.some((s) => s.sys.id === args.space)) {
    throw new AbortError(`No tienes acceso al space "${args.space}".`);
  }
  const spaceId = args.space ?? (await pickSpace(spaces, session.defaultSpaceId));
  const cma = createCma(session, spaceId, api.onRequest);

  const envs = await listEnvironments(cma);
  if (envs.length < 2) throw new AbortError('Este space tiene un solo ambiente; no hay a dónde migrar.');
  const src = args.from ? requireEnvironment(envs, args.from) : await pickSource(envs);
  const dst = args.to ? requireEnvironment(envs, args.to) : await pickDestination(envs, src);
  if (src === dst) throw new AbortError('Origen y destino son el mismo ambiente.');
  const rootIds = args.ids ?? (await askEntryIds());
  if (args.space || args.from || args.to || args.ids) {
    log.info(`space ${spaceId} · ${src} → ${dst} · ${rootIds.length} entry(s)`);
  }
  const repeat = repeatCommand({ spaceId, src, dst, rootIds });

  // 2. Análisis (solo lectura)
  log.step(`Analizando ${pc.bold(src)} ${pc.dim('──▶')} ${pc.bold(dst)}…`);
  const analysis = await analyze(cma, { src, dst, rootIds });

  // 3. Mostrar y decidir
  renderEntryTree(analysis);
  const writes = [...analysis.actions.values()].filter(isWrite).length;
  if (!dryRun && writes > LIMITS.confirmWritesAbove && !(await confirmLargeMigration(writes, dst))) {
    console.log(pc.dim('\nCancelado.'));
    return 0;
  }

  let withAssets = false;
  if (analysis.assets.ids.length) {
    renderAssets(analysis);
    const missing = analysis.assets.missing.length;
    if (missing) {
      withAssets = await askWithAssets(missing);
      if (!withAssets) {
        log.warn(
          `Las entries quedarán apuntando a ${missing} imagen(es) que no existen en ${dst}; no se podrán publicar hasta que existan.`,
        );
      }
    }
  }

  renderModel(analysis);
  const options = modelOptions(analysis);
  const picked = options.length ? await askModelChanges(options, dst) : [];

  const plan = buildPlan(analysis, { withAssets, picked });
  renderSummary(analysis, plan, { gaps: requiredGaps(analysis, plan), hyperlinks: brokenHyperlinks(analysis) });
  if (!plan.entries.length) throw new AbortError('No queda nada para migrar.');

  if (dryRun) {
    log.step('Modo --dry-run: no se escribió nada.');
    log.info(`Para migrar: ${repeat}`);
    log.info(`Llamadas a la API: ${api.count}`);
    return 0;
  }

  // 4. Confirmar, respaldar y escribir
  const dstEnv = envs.find((e) => e.id === dst) ?? { id: dst, aliases: [] };
  if (!(await confirmWrite(dstEnv, `¿Migrar a ${pc.bold(dst)}? (entries e imágenes en draft)`))) {
    console.log(pc.dim('\nCancelado.'));
    return 0;
  }
  // Lo que se mostró tiene que seguir siendo cierto: si destino cambió mientras revisabas, no se escribe.
  const changed = await changesSinceAnalysis(cma, analysis);
  if (changed.length) {
    throw new AbortError(
      `${dst} cambió mientras revisabas el plan (${changed.join(', ')}). No se escribió nada.`,
      'Vuelve a correr ctf-migrate para analizar de nuevo.',
    );
  }

  const backup = startBackup({ kind: 'migrate', spaceId, src, dst, rootIds });
  const failures = await executePlan(plan, analysis, createWriter(cma, { src, dst }), backup);

  log.step(
    failures.length ? `Terminado con ${failures.length} error(es)` : 'Listo. Ninguna entry ni imagen fue publicada.',
  );
  for (const id of rootIds) {
    log.info(`https://${session.appHost}/spaces/${spaceId}/environments/${dst}/entries/${id}`);
  }
  log.info(`Respaldo: ${backup.file}`);
  log.info('Para deshacer: ctf-migrate restore');
  log.info(`Para repetir: ${repeat}`);
  log.info(`Llamadas a la API: ${api.count}`);
  return failures.length ? 1 : 0;
}

/** Ambiente pasado por flag (ID o alias); si no existe, se detiene. */
function requireEnvironment(envs: Environment[], name: string): string {
  const id = resolveEnvironment(envs, name);
  if (!id) throw new AbortError(`El ambiente "${name}" no existe en este space.`);
  return id;
}

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
import { printCancelled, printHeader, printNote, printOutro, type RunMode, shouldAnimate } from '../ui/header.ts';
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
import { withStatus } from '../ui/status.ts';
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
  const animate = shouldAnimate(args.verbose);
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
  const analysis = await withStatus(
    `Analizando ${src} ──▶ ${dst}…`,
    animate,
    (status) => analyze(cma, { src, dst, rootIds }, status.update),
    (a) => `Análisis listo · ${a.tree.entries.size} entries · ${a.diffs.size} content types · ${api.count} llamadas`,
  );

  // 3. Mostrar y decidir
  renderEntryTree(analysis);
  const writes = [...analysis.actions.values()].filter(isWrite).length;
  if (!dryRun && writes > LIMITS.confirmWritesAbove && !(await confirmLargeMigration(writes, dst))) {
    printCancelled();
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
    printNote(
      [`Para migrar de verdad:`, pc.cyan(repeat), '', pc.dim(`Llamadas a la API: ${api.count}`)],
      'Modo --dry-run',
    );
    printOutro('No se escribió nada.');
    return 0;
  }

  // 4. Confirmar, respaldar y escribir
  const dstEnv = envs.find((e) => e.id === dst) ?? { id: dst, aliases: [] };
  if (!(await confirmWrite(dstEnv, `¿Migrar a ${pc.bold(dst)}? ${pc.dim('(entries e imágenes en draft)')}`))) {
    printCancelled();
    return 0;
  }
  // Lo que se mostró tiene que seguir siendo cierto: si destino cambió mientras revisabas, no se escribe.
  const changed = await withStatus(
    `Verificando que ${dst} no cambió…`,
    animate,
    () => changesSinceAnalysis(cma, analysis),
    (list) => (list.length ? `${dst} cambió` : `${dst} sigue igual`),
  );
  if (changed.length) {
    throw new AbortError(
      `${dst} cambió mientras revisabas el plan (${changed.join(', ')}). No se escribió nada.`,
      'Vuelve a correr ctf-migrate para analizar de nuevo.',
    );
  }

  const backup = startBackup({ kind: 'migrate', spaceId, src, dst, rootIds });
  const failures = await executePlan(plan, analysis, createWriter(cma, { src, dst }), backup, { animate });

  printNote(
    [
      ...rootIds.map((id) => pc.cyan(`https://${session.appHost}/spaces/${spaceId}/environments/${dst}/entries/${id}`)),
      '',
      `${pc.bold('Respaldo')}      ${backup.file}`,
      `${pc.bold('Deshacer')}      ctf-migrate restore`,
      `${pc.bold('Repetir')}       ${repeat}`,
      `${pc.bold('Llamadas API')}  ${api.count}`,
    ],
    failures.length ? 'Terminado con errores' : 'Migración lista',
  );
  printOutro(
    failures.length
      ? pc.red(`Terminado con ${failures.length} error(es).`)
      : pc.green('Listo. Ninguna entry ni imagen fue publicada.'),
  );
  return failures.length ? 1 : 0;
}

/** Ambiente pasado por flag (ID o alias); si no existe, se detiene. */
function requireEnvironment(envs: Environment[], name: string): string {
  const id = resolveEnvironment(envs, name);
  if (!id) throw new AbortError(`El ambiente "${name}" no existe en este space.`);
  return id;
}

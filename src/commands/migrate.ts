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
import type { CliArgs } from '../cli-args.ts';
import { LIMITS } from '../config.ts';
import { createCma } from '../contentful/client.ts';
import { listEnvironments, listSpaces } from '../contentful/read.ts';
import { createWriter } from '../contentful/write.ts';
import { brokenHyperlinks, buildPlan, isWrite, modelOptions } from '../core/plan.ts';
import { requiredGaps } from '../core/publish-check.ts';
import { AbortError } from '../errors.ts';
import { executePlan } from '../execute.ts';
import { loadSession } from '../session.ts';
import { log } from '../ui/log.ts';
import {
  askEntryIds,
  askModelChanges,
  askWithAssets,
  confirmLargeMigration,
  confirmWrite,
  pickEnvironments,
  pickSpace,
} from '../ui/prompts.ts';
import { renderAssets, renderEntryTree, renderModel, renderSummary } from '../ui/views.ts';

export async function migrate({ dryRun }: CliArgs): Promise<number> {
  console.log(
    pc.bold('\nContentful · migrar entries entre ambientes') +
      pc.dim(dryRun ? '  (--dry-run: no se escribe nada)' : '  (entries e imágenes quedan en draft)'),
  );

  // 1. Qué migrar y hacia dónde
  const session = loadSession();
  const spaces = await listSpaces(createCma(session));
  if (!spaces.length) throw new AbortError('Tu usuario no tiene acceso a ningún space.');
  const spaceId = await pickSpace(spaces, session.defaultSpaceId);
  const cma = createCma(session, spaceId);

  const envs = await listEnvironments(cma);
  if (envs.length < 2) throw new AbortError('Este space tiene un solo ambiente; no hay a dónde migrar.');
  const { src, dst } = await pickEnvironments(envs);
  const rootIds = await askEntryIds();

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
  return failures.length ? 1 : 0;
}

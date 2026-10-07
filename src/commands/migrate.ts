/**
 * `cfm migrate`: migra entries (padre + hijos) de un ambiente a otro.
 *   1. elegir space, ambientes y entries;
 *   2. analizar (solo lectura);
 *   3. mostrar y decidir (imágenes, modelo);
 *   4. confirmar, respaldar y escribir en destino.
 */

import pc from 'picocolors';
import { analyzeTree, changesSinceAnalysis, completeAnalysis, withActions } from '../analyze.ts';
import { APP_NAME } from '../app.ts';
import { type CliArgs, repeatCommand } from '../cli-args.ts';
import { LIMITS } from '../config.ts';
import { contentTypeOf } from '../core/entries.ts';
import { modelOptions } from '../core/model-changes.ts';
import {
  brokenHyperlinks,
  buildPlan,
  defaultUpdates,
  isWrite,
  updateCandidates,
  writtenContentTypes,
} from '../core/plan.ts';
import { requiredGaps } from '../core/publish-check.ts';
import { AbortError } from '../errors.ts';
import { executePlan } from '../execute.ts';
import { selectEntryIds } from '../selection/entries.ts';
import { printCancelled, printTitle } from '../ui/header.ts';
import { log } from '../ui/log.ts';
import { askEntryUpdates, askModelChanges, askWithAssets, confirmLargeMigration } from '../ui/prompts.ts';
import { withStatus } from '../ui/status.ts';
import { renderAssets } from '../ui/views/assets.ts';
import { renderEntryTree } from '../ui/views/entries.ts';
import { renderModelDiffs } from '../ui/views/model.ts';
import { renderSummary } from '../ui/views/summary.ts';
import { confirmWriting, finishDryRun, finishReading, finishWriting, openContext, startWriting } from './context.ts';

export async function migrate(args: CliArgs): Promise<number> {
  printTitle('Migrar entries', { dryRun: args.dryRun, note: 'entries e imágenes quedan en draft' });

  // 1. Qué migrar y hacia dónde
  const ctx = await openContext(args);
  const { src, dst } = ctx;
  const rootIds = await selectEntryIds(ctx, args);
  if (!rootIds.length) return finishReading(ctx, 'No se eligió ninguna entry.');
  const repeat = repeatCommand({ spaceId: ctx.spaceId, src, dst, rootIds });

  // 2. Árbol: qué existe en destino y qué cambió (solo lectura)
  const tree = await withStatus(
    `Analizando ${src} ──▶ ${dst}…`,
    ctx.animate,
    (status) => analyzeTree(ctx.cma, { src, dst, rootIds }, status.update, ctx),
    (t) => `Árbol listo · ${t.tree.entries.size} entries · ${ctx.api.count} llamadas`,
  );

  // 3. Mostrar y decidir qué actualizar de lo que ya existe
  const candidates = updateCandidates(tree);
  let toUpdate = defaultUpdates(candidates);
  renderEntryTree(withActions(tree, toUpdate));
  if (candidates.length) {
    const titleOf = (id: string) => {
      const entry = tree.tree.entries.get(id);
      return entry ? tree.titleOf(entry) : id;
    };
    const chosen = new Set(await askEntryUpdates(candidates, { titleOf, src, dst }));
    const changedChoice = chosen.size !== toUpdate.size || [...chosen].some((id) => !toUpdate.has(id));
    toUpdate = chosen;
    if (changedChoice) renderEntryTree(withActions(tree, toUpdate), 'Entries con tu elección');
  }
  const writes = [...withActions(tree, toUpdate).actions.values()].filter(isWrite).length;
  if (!writes) return finishReading(ctx, `No hay nada que crear ni actualizar en ${dst}.`);
  if (!args.dryRun && writes > LIMITS.confirmWritesAbove && !(await confirmLargeMigration(writes, dst))) {
    printCancelled();
    return 0;
  }

  const analysis = await withStatus(
    'Revisando modelo, imágenes y tags…',
    ctx.animate,
    (status) => completeAnalysis(ctx.cma, tree, toUpdate, status.update, ctx),
    (a) => `Análisis listo · ${a.diffs.size} content types · ${ctx.api.count} llamadas`,
  );

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

  const usedBy = (ctId: string) =>
    [...analysis.tree.entries.values()]
      .filter((e) => contentTypeOf(e) === ctId)
      .map((e) => analysis.titleOf(e) + (isWrite(analysis.actions.get(e.sys.id)) ? '' : ' (reutilizada)'));
  renderModelDiffs(analysis.diffs.values(), { src, dst, dstDefault: analysis.locales.dst.default }, usedBy);
  const options = modelOptions(analysis.diffs.values(), writtenContentTypes(analysis));
  const picked = options.length ? await askModelChanges(options, dst) : [];

  const plan = buildPlan(analysis, { withAssets, picked });
  renderSummary(analysis, plan, { gaps: requiredGaps(analysis, plan), hyperlinks: brokenHyperlinks(analysis) });
  if (!plan.entries.length) throw new AbortError('No queda nada para migrar.');
  if (args.dryRun) return finishDryRun(ctx, ['Para migrar de verdad:', pc.cyan(repeat)]);

  // 4. Confirmar, respaldar y escribir
  if (!(await confirmWriting(ctx, `¿Migrar a ${pc.bold(dst)}? ${pc.dim('(entries e imágenes en draft)')}`))) return 0;
  // Lo que se mostró tiene que seguir siendo cierto: si destino cambió mientras revisabas, no se escribe.
  const changed = await withStatus(
    `Verificando que ${dst} no cambió…`,
    ctx.animate,
    () => changesSinceAnalysis(ctx.cma, analysis),
    (list) => (list.length ? `${dst} cambió` : `${dst} sigue igual`),
  );
  if (changed.length) {
    throw new AbortError(
      `${dst} cambió mientras revisabas el plan (${changed.join(', ')}). No se escribió nada.`,
      `Vuelve a correr ${APP_NAME} para analizar de nuevo.`,
    );
  }

  const write = await startWriting(ctx, 'migrate', rootIds);
  await executePlan(plan, analysis, () => ctx.editorInterfaces(src), write);
  return finishWriting(ctx, write, {
    title: 'Migración lista',
    lines: [
      ...rootIds.map((id) =>
        pc.cyan(`https://${ctx.session.appHost}/spaces/${ctx.spaceId}/environments/${dst}/entries/${id}`),
      ),
      '',
      `${pc.bold('Repetir')}       ${repeat}`,
    ],
    done: 'Listo. Ninguna entry ni imagen fue publicada.',
  });
}

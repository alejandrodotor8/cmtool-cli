/**
 * `cfm migrate`: migra entries (padre + hijos) de un ambiente a otro.
 *   1. elegir space, ambientes y entries;
 *   2. analizar (solo lectura);
 *   3. mostrar y decidir (qué actualizar, imágenes, modelo);
 *   4. resumen, confirmar, respaldar y escribir en destino.
 * Cada pregunta es un paso: Esc vuelve a la anterior. Las decisiones se pueden pasar por
 * flags (`--update`, `--assets`, `--model`), y el resumen muestra el comando que las repite.
 */

import {
  AbortError,
  type Analysis,
  allPicks,
  analyzeTree,
  brokenHyperlinks,
  buildPlan,
  cache,
  changesSinceAnalysis,
  completeAnalysis,
  contentTypeOf,
  defaultUpdates,
  editorDiffsFor,
  executePlan,
  hasModelChanges,
  isWrite,
  LIMITS,
  type ModelOption,
  type ModelPick,
  modelOptions,
  type Plan,
  pickKey,
  requiredGaps,
  type TreeAnalysis,
  toDecision,
  type UpdateCandidate,
  updateCandidates,
  withActions,
  writtenContentTypes,
} from 'cmtool-core';
import pc from 'picocolors';
import { APP_NAME } from '../app.ts';
import { type CliArgs, repeatCommand } from '../cli-args.ts';
import { selectEntryIds } from '../selection/entries.ts';
import { printCancelled, printTitle } from '../ui/header.ts';
import { log } from '../ui/log.ts';
import { steps } from '../ui/navigation.ts';
import { askEntryUpdates, askModelChanges, askWithAssets, confirmLargeMigration } from '../ui/prompts.ts';
import { withStatus } from '../ui/status.ts';
import { renderAssets } from '../ui/views/assets.ts';
import { renderEntryTree } from '../ui/views/entries.ts';
import { renderModelDiffs } from '../ui/views/model.ts';
import { renderModelPicks, renderRepeat, renderSummary } from '../ui/views/summary.ts';
import {
  type Context,
  confirmWriting,
  contextSteps,
  finishDryRun,
  finishReading,
  finishWriting,
  loadEditors,
  modelPicksFromFlag,
  startWriting,
  updatesFromFlag,
} from './context.ts';

export async function migrate(args: CliArgs): Promise<number> {
  printTitle('Migrar entries', { dryRun: args.dryRun, note: 'entries e imágenes quedan en draft' });

  const context = contextSteps(args);
  const trees = cache<TreeAnalysis>();
  const analyses = cache<Analysis>();
  let ctx: Context;
  let rootIds: string[] = [];
  let tree: TreeAnalysis;
  let candidates: UpdateCandidate[] = [];
  let toUpdate = new Set<string>();
  let analysis: Analysis;
  let withAssets: boolean | undefined;
  let options: ModelOption[] = [];
  let picked: ModelPick[] = [];
  let plan: Plan;

  /** El comando que repite esta migración con todo lo que se eligió. */
  const repeat = () =>
    repeatCommand('migrate', {
      spaceId: ctx.spaceId,
      src: ctx.src,
      dst: ctx.dst,
      ids: rootIds,
      update: candidates.length
        ? toDecision(
            candidates.map((c) => c.id),
            toUpdate,
          )
        : undefined,
      assets: withAssets,
      model: options.length ? toDecision(allPicks(options).map(pickKey), picked.map(pickKey)) : undefined,
    });

  const code = await steps([
    // 1. Qué migrar y hacia dónde
    ...context.steps,
    async () => {
      ctx = context.ctx();
      rootIds = await selectEntryIds(ctx, args);
      if (!rootIds.length) return finishReading(ctx, 'No se eligió ninguna entry.');
    },

    // 2. Árbol: qué existe en destino y qué cambió; decidir qué actualizar de lo que ya existe
    async () => {
      const { src, dst } = ctx;
      tree = await trees(`${ctx.spaceId}|${src}|${dst}|${rootIds.join(',')}`, () =>
        withStatus(
          `Analizando ${src} ──▶ ${dst}…`,
          ctx.animate,
          (status) => analyzeTree(ctx.cma, { src, dst, rootIds }, status.update, ctx),
          (t) => `Árbol listo · ${t.tree.entries.size} entries · ${ctx.api.count} llamadas`,
        ),
      );
      candidates = updateCandidates(tree);
      toUpdate = defaultUpdates(candidates);
      renderEntryTree(withActions(tree, toUpdate));
      if (!candidates.length) return;

      const chosen = new Set(
        args.update
          ? updatesFromFlag(candidates, args.update)
          : await askEntryUpdates(candidates, { titleOf: (id) => titleOfId(tree, id), src, dst }),
      );
      const changedChoice = chosen.size !== toUpdate.size || [...chosen].some((id) => !toUpdate.has(id));
      toUpdate = chosen;
      if (changedChoice) renderEntryTree(withActions(tree, toUpdate), 'Entries con tu elección');
    },
    async () => {
      const writes = [...withActions(tree, toUpdate).actions.values()].filter(isWrite).length;
      if (!args.dryRun && writes > LIMITS.confirmWritesAbove && !(await confirmLargeMigration(writes, ctx.dst))) {
        printCancelled();
        return 0;
      }
    },

    // 3. Imágenes y modelo de lo que se escribe
    async () => {
      const key = `${ctx.spaceId}|${ctx.src}|${ctx.dst}|${rootIds.join(',')}|${[...toUpdate].sort().join(',')}`;
      analysis = await analyses(key, () =>
        withStatus(
          'Revisando modelo, imágenes y tags…',
          ctx.animate,
          (status) => completeAnalysis(ctx.cma, tree, toUpdate, status.update, ctx),
          (a) => `Análisis listo · ${a.diffs.size} content types · ${ctx.api.count} llamadas`,
        ),
      );
      withAssets = undefined;
      if (!analysis.assets.ids.length) return;
      renderAssets(analysis);
      const missing = analysis.assets.missing.length;
      if (!missing) return;
      withAssets = args.assets ?? (await askWithAssets(missing));
      if (!withAssets) {
        log.warn(
          `Las entries quedarán apuntando a ${missing} imagen(es) que no existen en ${ctx.dst}; no se podrán publicar hasta que existan.`,
        );
      }
    },
    async () => {
      const usedBy = (ctId: string) =>
        [...analysis.tree.entries.values()]
          .filter((e) => contentTypeOf(e) === ctId)
          .map((e) => analysis.titleOf(e) + (isWrite(analysis.actions.get(e.sys.id)) ? '' : ' (reutilizada)'));
      const [srcEditors, dstEditors] = await loadEditors(ctx);
      const editorDiffs = editorDiffsFor(analysis.diffs.values(), srcEditors, dstEditors);
      renderModelDiffs(
        analysis.diffs.values(),
        { src: ctx.src, dst: ctx.dst, dstDefault: analysis.locales.dst.default, editorDiffs },
        usedBy,
      );
      options = modelOptions(analysis.diffs.values(), writtenContentTypes(analysis), editorDiffs);
      if (!options.length) picked = [];
      else picked = args.model ? modelPicksFromFlag(options, args.model) : await askModelChanges(options, ctx.dst);
    },

    // 4. Resumen (con el comando para repetirlo) y confirmación
    async () => {
      plan = buildPlan(analysis, { withAssets: withAssets ?? false, picked });
      if (!plan.entries.length && !hasModelChanges(plan) && !plan.tagsToCreate.length) {
        return finishReading(ctx, `No hay nada que crear ni actualizar en ${ctx.dst}.`);
      }
      renderSummary(analysis, plan, { gaps: requiredGaps(analysis, plan), hyperlinks: brokenHyperlinks(analysis) });
      renderModelPicks(options, picked, ctx.dst);
      if (args.dryRun) return finishDryRun(ctx, ['Para migrar de verdad:', pc.cyan(repeat())]);
      renderRepeat(repeat());
      const question = `¿Migrar a ${pc.bold(ctx.dst)}? ${pc.dim('(entries e imágenes en draft)')}`;
      if (!(await confirmWriting(ctx, question))) return 0;
    },

    // 5. Escribir (ya no se pregunta nada)
    async () => {
      // Lo que se mostró tiene que seguir siendo cierto: si destino cambió mientras revisabas, no se escribe.
      const changed = await withStatus(
        `Verificando que ${ctx.dst} no cambió…`,
        ctx.animate,
        () => changesSinceAnalysis(ctx.cma, analysis),
        (list) => (list.length ? `${ctx.dst} cambió` : `${ctx.dst} sigue igual`),
      );
      if (changed.length) {
        throw new AbortError(
          `${ctx.dst} cambió mientras revisabas el plan (${changed.join(', ')}). No se escribió nada.`,
          `Vuelve a correr ${APP_NAME} para analizar de nuevo.`,
        );
      }

      const write = await startWriting(ctx, 'migrate', rootIds);
      await executePlan(plan, analysis, () => ctx.editorInterfaces(ctx.src), write);
      return finishWriting(ctx, write, {
        title: 'Migración lista',
        lines: rootIds.map((id) =>
          pc.cyan(`https://${ctx.session.appHost}/spaces/${ctx.spaceId}/environments/${ctx.dst}/entries/${id}`),
        ),
        repeat: repeat(),
        done: 'Listo. Ninguna entry ni imagen fue publicada.',
      });
    },
  ]);
  return code ?? 0;
}

/** Título de una entry del árbol por su ID. */
function titleOfId(tree: TreeAnalysis, id: string): string {
  const entry = tree.tree.entries.get(id);
  return entry ? tree.titleOf(entry) : id;
}

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
  entryMigration,
  LIMITS,
  type MigrationPlan,
  type MigrationReview,
  type MigrationTree,
  type ModelChoices,
  type ModelPick,
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
  modelPicksFromFlag,
  startWriting,
  updatesFromFlag,
} from './context.ts';

export async function migrate(args: CliArgs): Promise<number> {
  printTitle('Migrar entries', { dryRun: args.dryRun, note: 'entries e imágenes quedan en draft' });

  const context = contextSteps(args);
  let ctx: Context;
  let rootIds: string[] = [];
  // Cada etapa sale de la anterior (ver entryMigration en cmtool-core). Volver atrás no repite lecturas.
  let tree: MigrationTree;
  let toUpdate = new Set<string>();
  let review: MigrationReview;
  let withAssets: boolean | undefined;
  let choices: ModelChoices | undefined;
  let picked: ModelPick[] = [];
  let plan: MigrationPlan;

  /** El comando que repite esta migración con todo lo que se eligió. */
  const repeat = () =>
    repeatCommand('migrate', {
      spaceId: ctx.spaceId,
      src: ctx.src,
      dst: ctx.dst,
      ids: rootIds,
      update: tree.updateDecision(toUpdate),
      assets: withAssets,
      model: choices?.all.length ? choices.decisionFor(picked) : undefined,
    });

  const code = await steps([
    // 1. Qué migrar y hacia dónde
    ...context.steps,
    async () => {
      ctx = context.ctx();
      rootIds = await selectEntryIds(ctx, args);
      if (!rootIds.length) return finishReading(ctx, 'No se eligió ninguna entry.');
    },

    // 2. El árbol: qué existe en destino y qué cambió; decidir qué actualizar de lo que ya existe
    async () => {
      const { src, dst } = ctx;
      tree = await withStatus(
        `Analizando ${src} ──▶ ${dst}…`,
        ctx.animate,
        (status) => entryMigration(ctx.space, ctx).analyze(rootIds, status.update),
        (t) => `Árbol listo · ${t.analysis.tree.entries.size} entries · ${ctx.api.count} llamadas`,
      );
      toUpdate = tree.defaultUpdates();
      renderEntryTree(tree.preview(toUpdate));
      if (!tree.candidates.length) return;

      const chosen = args.update
        ? updatesFromFlag(tree, args.update)
        : new Set(await askEntryUpdates(tree.candidates, { titleOf: (id) => titleOfId(tree, id), src, dst }));
      const changedChoice = chosen.size !== toUpdate.size || [...chosen].some((id) => !toUpdate.has(id));
      toUpdate = chosen;
      if (changedChoice) renderEntryTree(tree.preview(toUpdate), 'Entries con tu elección');
    },
    async () => {
      const writes = tree.writes(toUpdate);
      if (!args.dryRun && writes > LIMITS.confirmWritesAbove && !(await confirmLargeMigration(writes, ctx.dst))) {
        printCancelled();
        return 0;
      }
    },

    // 3. Imágenes y modelo de lo que se escribe
    async () => {
      review = await withStatus(
        'Revisando modelo, imágenes y tags…',
        ctx.animate,
        (status) => tree.review(toUpdate, status.update),
        (r) => `Análisis listo · ${r.analysis.diffs.size} content types · ${ctx.api.count} llamadas`,
      );
      const { analysis } = review;
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
      const { analysis } = review;
      choices = await withStatus(
        'Leyendo la apariencia del editor…',
        ctx.animate,
        () => review.modelChoices(),
        () => 'Apariencia del editor leída',
      );
      const usedBy = (ctId: string) =>
        review.entriesOf(ctId).map(({ title, written }) => title + (written ? '' : ' (reutilizada)'));
      renderModelDiffs(
        analysis.diffs.values(),
        { src: ctx.src, dst: ctx.dst, dstDefault: analysis.locales.dst.default, editorDiffs: choices.editorDiffs },
        usedBy,
      );
      if (!choices.all.length) picked = [];
      else
        picked = args.model ? modelPicksFromFlag(choices, args.model) : await askModelChanges(choices.options, ctx.dst);
    },

    // 4. Resumen (con el comando para repetirlo) y confirmación
    async () => {
      plan = review.plan({ withAssets: withAssets ?? false, picked });
      if (plan.isEmpty) return finishReading(ctx, `No hay nada que crear ni actualizar en ${ctx.dst}.`);
      renderSummary(review.analysis, plan.plan, { gaps: plan.gaps, hyperlinks: plan.brokenHyperlinks });
      renderModelPicks(choices?.options ?? [], picked, ctx.dst);
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
        () => plan.changesInDestination(),
        (list) => (list.length ? `${ctx.dst} cambió` : `${ctx.dst} sigue igual`),
      );
      if (changed.length) {
        throw new AbortError(
          `${ctx.dst} cambió mientras revisabas el plan (${changed.join(', ')}). No se escribió nada.`,
          `Vuelve a correr ${APP_NAME} para analizar de nuevo.`,
        );
      }

      const write = await startWriting(ctx, 'migrate', rootIds);
      await plan.execute(write);
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
function titleOfId({ analysis }: MigrationTree, id: string): string {
  const entry = analysis.tree.entries.get(id);
  return entry ? analysis.titleOf(entry) : id;
}

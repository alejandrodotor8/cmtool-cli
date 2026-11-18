/**
 * `cfm migrate-model`: lleva al modelo de destino lo que elijas de origen (content types y
 * campos que faltan, reglas de campos y apariencia del editor), sin tocar contenido.
 * Nunca borra campos ni cambia su ID o tipo.
 */

import { type ModelPick, type ModelPlan, type ModelReview, modelMigration } from 'cmtool-core';
import pc from 'picocolors';
import { APP_NAME } from '../app.ts';
import { type CliArgs, repeatCommand } from '../cli-args.ts';
import { printTitle } from '../ui/header.ts';
import { log } from '../ui/log.ts';
import { steps } from '../ui/navigation.ts';
import { askModelChanges } from '../ui/prompts.ts';
import { withStatus } from '../ui/status.ts';
import { renderModelDiffs, renderModelOverview } from '../ui/views/model.ts';
import { modelSummary, renderModelPicks, renderRepeat } from '../ui/views/summary.ts';
import {
  type Context,
  confirmWriting,
  contextSteps,
  finishDryRun,
  finishReading,
  finishWriting,
  modelPicksFromFlag,
  startWriting,
} from './context.ts';

/** Hasta cuántos content types se muestran campo por campo antes de pedir que se filtre. */
const DETAIL_LIMIT = 5;

export async function migrateModel(args: CliArgs): Promise<number> {
  printTitle('Migrar modelo', { dryRun: args.dryRun, note: 'solo el modelo, sin contenido' });
  const context = contextSteps(args);
  let ctx: Context;
  // Las etapas salen de modelMigration (cmtool-core): comparar → elegir → plan → escribir.
  let review: ModelReview;
  let picked: ModelPick[] = [];
  let plan: ModelPlan;

  const repeat = () =>
    repeatCommand('migrate-model', {
      spaceId: ctx.spaceId,
      src: ctx.src,
      dst: ctx.dst,
      contentTypes: args.contentTypes,
      model: review.choices.decisionFor(picked),
    });

  const code = await steps([
    ...context.steps,
    async () => {
      ctx = context.ctx();
      review = await withStatus(
        'Leyendo modelos…',
        ctx.animate,
        (status) => modelMigration(ctx.space, ctx).analyze({ contentTypes: args.contentTypes }, status.update),
        ({ models }) => `${models.src.size} content types en ${ctx.src} · ${models.dst.size} en ${ctx.dst}`,
      );
      const { choices } = review;
      if (review.isUpToDate) {
        return finishReading(ctx, `El modelo de ${ctx.dst} ya tiene todo lo de ${ctx.src}, con la misma apariencia.`);
      }

      const candidates = choices.options.map((o) => o.diff);
      const dstDefault = (await ctx.space.locales(ctx.dst)).default;
      const view = { src: ctx.src, dst: ctx.dst, dstDefault, editorDiffs: choices.editorDiffs };
      renderModelOverview({ diffs: candidates, onlyInDst: [] }, view);
      if (candidates.length <= DETAIL_LIMIT) renderModelDiffs(candidates, view);
      else log.info(`Para ver el detalle campo por campo: ${APP_NAME} compare-models --content-type <id>`);

      picked = args.model ? modelPicksFromFlag(choices, args.model) : await askModelChanges(choices.options, ctx.dst);
      plan = review.plan(picked);
      if (plan.isEmpty) return finishReading(ctx, `El modelo de ${ctx.dst} queda como está.`);
    },
    async () => {
      log.step('Resumen');
      renderModelPicks(review.choices.options, picked, ctx.dst);
      log.block(`${pc.bold('Modelo')}  ${modelSummary(plan.changes)}`);
      if (plan.notAdded.length) log.info(`Quedan sin agregar: ${plan.notAdded.join(', ')}`);
      if (args.dryRun) return finishDryRun(ctx, ['Para aplicarlo de verdad:', pc.cyan(repeat())]);
      renderRepeat(repeat());
      if (!(await confirmWriting(ctx, `¿Aplicar estos cambios al modelo de ${pc.bold(ctx.dst)}?`))) return 0;
    },
    async () => {
      const write = await startWriting(ctx, 'model');
      await plan.execute(write);
      return finishWriting(ctx, write, {
        title: 'Modelo actualizado',
        repeat: repeat(),
        done: plan.changesStructure
          ? 'Listo. Los cambios del modelo quedaron publicados (Contentful lo exige para usarlos).'
          : 'Listo. La apariencia del editor quedó copiada.',
      });
    },
  ]);
  return code ?? 0;
}

/**
 * `cfm migrate-model`: lleva al modelo de destino lo que elijas de origen (content types y
 * campos que faltan, reglas de campos y apariencia del editor), sin tocar contenido.
 * Nunca borra campos ni cambia su ID o tipo.
 */

import pc from 'picocolors';
import { APP_NAME } from '../app.ts';
import { type CliArgs, repeatCommand } from '../cli-args.ts';
import type { ContentType, EditorInterface } from '../contentful/types.ts';
import { toDecision } from '../core/decision.ts';
import { editorDiffsFor } from '../core/editor.ts';
import { compareModels } from '../core/model.ts';
import {
  allPicks,
  changesStructure,
  hasModelChanges,
  type ModelChanges,
  type ModelOption,
  type ModelPick,
  modelChangesFrom,
  modelOptions,
  notAddedFields,
  pickKey,
} from '../core/model-changes.ts';
import { applyModelChanges } from '../execute.ts';
import { printTitle } from '../ui/header.ts';
import { log } from '../ui/log.ts';
import { steps } from '../ui/navigation.ts';
import { askModelChanges } from '../ui/prompts.ts';
import { renderModelDiffs, renderModelOverview } from '../ui/views/model.ts';
import { modelSummary, renderModelPicks, renderRepeat } from '../ui/views/summary.ts';
import {
  type Context,
  confirmWriting,
  contextSteps,
  finishDryRun,
  finishReading,
  finishWriting,
  loadEditors,
  loadModels,
  modelPicksFromFlag,
  requireContentTypes,
  startWriting,
} from './context.ts';

/** Hasta cuántos content types se muestran campo por campo antes de pedir que se filtre. */
const DETAIL_LIMIT = 5;

export async function migrateModel(args: CliArgs): Promise<number> {
  printTitle('Migrar modelo', { dryRun: args.dryRun, note: 'solo el modelo, sin contenido' });
  const context = contextSteps(args);
  let ctx: Context;
  let srcCTs: Map<string, ContentType>;
  let dstCTs: Map<string, ContentType>;
  let srcEditors: Map<string, EditorInterface>;
  let options: ModelOption[] = [];
  let picked: ModelPick[] = [];
  let changes: ModelChanges;

  const repeat = () =>
    repeatCommand('migrate-model', {
      spaceId: ctx.spaceId,
      src: ctx.src,
      dst: ctx.dst,
      contentTypes: args.contentTypes,
      model: toDecision(allPicks(options).map(pickKey), picked.map(pickKey)),
    });

  const code = await steps([
    ...context.steps,
    async () => {
      ctx = context.ctx();
      [srcCTs, dstCTs] = await loadModels(ctx);
      requireContentTypes(args.contentTypes, srcCTs, dstCTs);
      let dstEditors: Map<string, EditorInterface>;
      [srcEditors, dstEditors] = await loadEditors(ctx);
      const diffs = compareModels(srcCTs, dstCTs, args.contentTypes).diffs;
      const editorDiffs = editorDiffsFor(diffs, srcEditors, dstEditors);
      options = modelOptions(diffs, undefined, editorDiffs);
      const candidates = options.map((o) => o.diff);
      if (!candidates.length) {
        return finishReading(ctx, `El modelo de ${ctx.dst} ya tiene todo lo de ${ctx.src}, con la misma apariencia.`);
      }

      const view = { src: ctx.src, dst: ctx.dst, dstDefault: (await ctx.locales(ctx.dst)).default, editorDiffs };
      renderModelOverview({ diffs: candidates, onlyInDst: [] }, view);
      if (candidates.length <= DETAIL_LIMIT) renderModelDiffs(candidates, view);
      else log.info(`Para ver el detalle campo por campo: ${APP_NAME} compare-models --content-type <id>`);

      picked = args.model ? modelPicksFromFlag(options, args.model) : await askModelChanges(options, ctx.dst);
      changes = modelChangesFrom(picked, srcCTs);
      if (!hasModelChanges(changes)) return finishReading(ctx, `El modelo de ${ctx.dst} queda como está.`);
    },
    async () => {
      log.step('Resumen');
      renderModelPicks(options, picked, ctx.dst);
      log.block(`${pc.bold('Modelo')}  ${modelSummary(changes)}`);
      const notAdded = notAddedFields(
        options.map((o) => o.diff),
        changes.fieldsToAdd,
      );
      if (notAdded.length) log.info(`Quedan sin agregar: ${notAdded.join(', ')}`);
      if (args.dryRun) return finishDryRun(ctx, ['Para aplicarlo de verdad:', pc.cyan(repeat())]);
      renderRepeat(repeat());
      if (!(await confirmWriting(ctx, `¿Aplicar estos cambios al modelo de ${pc.bold(ctx.dst)}?`))) return 0;
    },
    async () => {
      const write = await startWriting(ctx, 'model');
      await applyModelChanges(changes, new Map(dstCTs), async () => srcEditors, write);
      return finishWriting(ctx, write, {
        title: 'Modelo actualizado',
        repeat: repeat(),
        done: changesStructure(changes)
          ? 'Listo. Los cambios del modelo quedaron publicados (Contentful lo exige para usarlos).'
          : 'Listo. La apariencia del editor quedó copiada.',
      });
    },
  ]);
  return code ?? 0;
}

/**
 * `cfm migrate-model`: agrega al modelo de destino content types y campos que
 * faltan, sin tocar contenido. Nunca borra ni modifica campos existentes.
 */

import pc from 'picocolors';
import { APP_NAME } from '../app.ts';
import type { CliArgs } from '../cli-args.ts';
import { editorDiffsFor } from '../core/editor.ts';
import { compareModels } from '../core/model.ts';
import { hasModelChanges, modelChangesFrom, modelOptions, notAddedFields } from '../core/model-changes.ts';
import { applyModelChanges } from '../execute.ts';
import { printTitle } from '../ui/header.ts';
import { log } from '../ui/log.ts';
import { askModelChanges } from '../ui/prompts.ts';
import { renderModelDiffs, renderModelOverview } from '../ui/views/model.ts';
import { modelSummary } from '../ui/views/summary.ts';
import {
  confirmWriting,
  finishDryRun,
  finishReading,
  finishWriting,
  loadEditors,
  loadModels,
  openContext,
  requireContentTypes,
  startWriting,
} from './context.ts';

/** Hasta cuántos content types se muestran campo por campo antes de pedir que se filtre. */
const DETAIL_LIMIT = 5;

export async function migrateModel(args: CliArgs): Promise<number> {
  printTitle('Migrar modelo', { dryRun: args.dryRun, note: 'solo content types y campos, sin contenido' });
  const ctx = await openContext(args);
  const [srcCTs, dstCTs] = await loadModels(ctx);
  requireContentTypes(args.contentTypes, srcCTs, dstCTs);

  const [srcEditors, dstEditors] = await loadEditors(ctx);
  const diffs = compareModels(srcCTs, dstCTs, args.contentTypes).diffs;
  const editorDiffs = editorDiffsFor(diffs, srcEditors, dstEditors);
  const candidates = diffs.filter((d) => d.missingCT || d.missing.length || editorDiffs.has(d.id));
  if (!candidates.length) {
    return finishReading(ctx, `El modelo de ${ctx.dst} ya tiene todo lo de ${ctx.src}, con la misma apariencia.`);
  }

  const view = { src: ctx.src, dst: ctx.dst, dstDefault: (await ctx.locales(ctx.dst)).default, editorDiffs };
  renderModelOverview({ diffs: candidates, onlyInDst: [] }, view);
  if (candidates.length <= DETAIL_LIMIT) renderModelDiffs(candidates, view);
  else log.info(`Para ver el detalle campo por campo: ${APP_NAME} compare-models --content-type <id>`);

  const picked = await askModelChanges(modelOptions(candidates, undefined, editorDiffs), ctx.dst);
  const changes = modelChangesFrom(picked, srcCTs, editorDiffs);
  if (!hasModelChanges(changes)) return finishReading(ctx, 'No se marcó nada: el modelo no se toca.');

  log.step('Resumen');
  log.block(`${pc.bold('Modelo')}  ${modelSummary(changes)}`);
  const notAdded = notAddedFields(candidates, changes.fieldsToAdd);
  if (notAdded.length) log.info(`Quedan sin agregar: ${notAdded.join(', ')}`);
  if (args.dryRun) return finishDryRun(ctx);

  if (!(await confirmWriting(ctx, `¿Aplicar estos cambios al modelo de ${pc.bold(ctx.dst)}?`))) return 0;
  const write = await startWriting(ctx, 'model');
  await applyModelChanges(changes, new Map(dstCTs), async () => srcEditors, write);
  return finishWriting(ctx, write, {
    title: 'Modelo actualizado',
    done:
      changes.contentTypesToCreate.length || changes.fieldsToAdd.size
        ? 'Listo. Los cambios del modelo quedaron publicados (Contentful lo exige para usarlos).'
        : 'Listo. La apariencia del editor quedó copiada.',
  });
}

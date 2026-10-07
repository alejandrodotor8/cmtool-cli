/** `cfm compare-models`: diferencias de modelo entre dos ambientes. Solo lectura. */
import type { CliArgs } from '../cli-args.ts';
import { editorDiffsFor } from '../core/editor.ts';
import { compareModels, hasDifferences } from '../core/model.ts';
import { modelComparisonReport } from '../report/markdown.ts';
import { offerReport, reportName } from '../report/save.ts';
import { printTitle } from '../ui/header.ts';
import { log } from '../ui/log.ts';
import { renderEditorDiffs, renderModelDiffs, renderModelOverview } from '../ui/views/model.ts';
import { finishReading, loadEditors, loadModels, openContext, requireContentTypes } from './context.ts';

/** Hasta cuántos content types con diferencias se muestran campo por campo. */
const DETAIL_LIMIT = 8;

export async function compareModelsCommand(args: CliArgs): Promise<number> {
  printTitle('Comparar modelos', { note: 'solo lectura' });
  const ctx = await openContext(args);
  const [srcCTs, dstCTs] = await loadModels(ctx);
  requireContentTypes(args.contentTypes, srcCTs, dstCTs);

  const comparison = compareModels(srcCTs, dstCTs, args.contentTypes);
  const view = { src: ctx.src, dst: ctx.dst, dstDefault: (await ctx.locales(ctx.dst)).default };
  renderModelOverview(comparison, view);

  const [srcEditors, dstEditors] = await loadEditors(ctx);
  const editorDiffs = editorDiffsFor(comparison.diffs, srcEditors, dstEditors);
  const different = comparison.diffs.filter(hasDifferences);
  if (!different.length && !comparison.onlyInDst.length && !editorDiffs.size) log.ok('Los modelos coinciden.');
  else if (args.contentTypes || different.length <= DETAIL_LIMIT) renderModelDiffs(different, view);
  else
    log.info(`Hay ${different.length} con diferencias: para el detalle usa --content-type <id> o guarda el reporte.`);

  if (editorDiffs.size) renderEditorDiffs(editorDiffs, comparison.diffs, ctx.dst);

  await offerReport(args, reportName('modelos', ctx.src, ctx.dst), () =>
    modelComparisonReport(comparison, view, editorDiffs),
  );
  return finishReading(ctx, 'Comparación lista.');
}

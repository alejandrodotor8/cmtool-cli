/** `ctf-migrate compare-models`: diferencias de modelo entre dos ambientes. Solo lectura. */
import type { CliArgs } from '../cli-args.ts';
import { compareModels, hasDifferences } from '../core/model.ts';
import { modelComparisonReport } from '../report/markdown.ts';
import { offerReport, reportName } from '../report/save.ts';
import { printTitle } from '../ui/header.ts';
import { log } from '../ui/log.ts';
import { renderModelDiffs, renderModelOverview } from '../ui/views/model.ts';
import { finishReading, loadModels, openContext, requireContentTypes } from './context.ts';

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

  const different = comparison.diffs.filter(hasDifferences);
  if (!different.length && !comparison.onlyInDst.length) log.ok('Los modelos coinciden.');
  else if (args.contentTypes || different.length <= DETAIL_LIMIT) renderModelDiffs(different, view);
  else
    log.info(`Hay ${different.length} con diferencias: para el detalle usa --content-type <id> o guarda el reporte.`);

  await offerReport(args, reportName('modelos', ctx.src, ctx.dst), () => modelComparisonReport(comparison, view));
  return finishReading(ctx, 'Comparación lista.');
}

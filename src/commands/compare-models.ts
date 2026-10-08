/** `cfm compare-models`: diferencias de modelo entre dos ambientes. Solo lectura. */
import { type CliArgs, repeatCommand } from '../cli-args.ts';
import { editorDiffsFor } from '../core/editor.ts';
import { compareModels, hasDifferences } from '../core/model.ts';
import { modelComparisonReport } from '../report/markdown.ts';
import { offerReport, reportName } from '../report/save.ts';
import { printTitle } from '../ui/header.ts';
import { log } from '../ui/log.ts';
import { steps } from '../ui/navigation.ts';
import { renderModelDiffs, renderModelOverview } from '../ui/views/model.ts';
import { contextSteps, finishReading, loadEditors, loadModels, requireContentTypes } from './context.ts';

/** Hasta cuántos content types con diferencias se muestran campo por campo. */
const DETAIL_LIMIT = 8;

export async function compareModelsCommand(args: CliArgs): Promise<number> {
  printTitle('Comparar modelos', { note: 'solo lectura' });
  const context = contextSteps(args);
  const code = await steps([
    ...context.steps,
    async () => {
      const ctx = context.ctx();
      const [srcCTs, dstCTs] = await loadModels(ctx);
      requireContentTypes(args.contentTypes, srcCTs, dstCTs);

      const comparison = compareModels(srcCTs, dstCTs, args.contentTypes);
      const [srcEditors, dstEditors] = await loadEditors(ctx);
      const editorDiffs = editorDiffsFor(comparison.diffs, srcEditors, dstEditors);
      const view = { src: ctx.src, dst: ctx.dst, dstDefault: (await ctx.locales(ctx.dst)).default, editorDiffs };
      renderModelOverview(comparison, view);

      const different = comparison.diffs.filter((d) => hasDifferences(d) || editorDiffs.has(d.id));
      if (!different.length && !comparison.onlyInDst.length) log.ok('Los modelos coinciden.');
      else if (args.contentTypes || different.length <= DETAIL_LIMIT) renderModelDiffs(different, view);
      else
        log.info(
          `Hay ${different.length} con diferencias: para el detalle usa --content-type <id> o guarda el reporte.`,
        );

      await offerReport(args, reportName('modelos', ctx.src, ctx.dst), () =>
        modelComparisonReport(comparison, view, editorDiffs),
      );
      const repeat = repeatCommand('compare-models', {
        spaceId: ctx.spaceId,
        src: ctx.src,
        dst: ctx.dst,
        contentTypes: args.contentTypes,
      });
      return finishReading(ctx, 'Comparación lista.', repeat);
    },
  ]);
  return code ?? 0;
}

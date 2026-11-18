/** `cfm compare-models`: diferencias de modelo entre dos ambientes. Solo lectura. */

import { hasDifferences, modelComparisonReport, modelMigration } from 'cmtool-core';
import { type CliArgs, repeatCommand } from '../cli-args.ts';
import { offerReport, reportName } from '../report/save.ts';
import { printTitle } from '../ui/header.ts';
import { log } from '../ui/log.ts';
import { steps } from '../ui/navigation.ts';
import { withStatus } from '../ui/status.ts';
import { renderModelDiffs, renderModelOverview } from '../ui/views/model.ts';
import { contextSteps, finishReading } from './context.ts';

/** Hasta cuántos content types con diferencias se muestran campo por campo. */
const DETAIL_LIMIT = 8;

export async function compareModelsCommand(args: CliArgs): Promise<number> {
  printTitle('Comparar modelos', { note: 'solo lectura' });
  const context = contextSteps(args);
  const code = await steps([
    ...context.steps,
    async () => {
      const ctx = context.ctx();
      // La etapa de análisis de "migrar modelo" solo lee: es la misma comparación.
      const { comparison, choices } = await withStatus(
        'Leyendo modelos…',
        ctx.animate,
        (status) => modelMigration(ctx.space, ctx).analyze({ contentTypes: args.contentTypes }, status.update),
        ({ models }) => `${models.src.size} content types en ${ctx.src} · ${models.dst.size} en ${ctx.dst}`,
      );
      const { editorDiffs } = choices;
      const dstDefault = (await ctx.space.locales(ctx.dst)).default;
      const view = { src: ctx.src, dst: ctx.dst, dstDefault, editorDiffs };
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

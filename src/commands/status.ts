/** `cfm status`: resumen de en qué se diferencian dos ambientes. Solo lectura. */
import { APP_NAME } from '../app.ts';
import type { CliArgs } from '../cli-args.ts';
import { readTags } from '../contentful/read.ts';
import { compareModels, hasDifferences } from '../core/model.ts';
import { environmentStatus } from '../core/status.ts';
import { statusReport } from '../report/markdown.ts';
import { offerReport, reportName } from '../report/save.ts';
import { printTitle } from '../ui/header.ts';
import { log } from '../ui/log.ts';
import { withStatus } from '../ui/status.ts';
import { renderModelOverview } from '../ui/views/model.ts';
import { renderStatus } from '../ui/views/status.ts';
import { finishReading, loadModels, openContext } from './context.ts';

export async function status(args: CliArgs): Promise<number> {
  printTitle('Estado de los ambientes', { note: 'solo lectura' });
  const ctx = await openContext(args);
  const [srcCTs, dstCTs] = await loadModels(ctx);
  const [srcLocales, dstLocales, srcTags, dstTags] = await withStatus(
    'Revisando idiomas y tags…',
    ctx.animate,
    () =>
      Promise.all([ctx.locales(ctx.src), ctx.locales(ctx.dst), readTags(ctx.cma, ctx.src), readTags(ctx.cma, ctx.dst)]),
    () => 'Idiomas y tags revisados',
  );

  const model = compareModels(srcCTs, dstCTs);
  const result = environmentStatus(
    model,
    { src: srcLocales, dst: dstLocales },
    { src: new Set(srcTags.keys()), dst: new Set(dstTags.keys()) },
  );
  renderStatus(result, ctx);

  const differing = { diffs: model.diffs.filter(hasDifferences), onlyInDst: model.onlyInDst };
  if (differing.diffs.length || differing.onlyInDst.length) {
    renderModelOverview(differing, ctx);
    log.info(`Detalle campo por campo: ${APP_NAME} compare-models`);
  }

  await offerReport(args, reportName('estado', ctx.src, ctx.dst), () => statusReport(result, model, ctx));
  return finishReading(ctx, 'Revisión lista.');
}

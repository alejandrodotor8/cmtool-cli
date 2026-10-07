/** `cfm compare-entry`: una o varias entries campo por campo entre dos ambientes. Solo lectura. */
import type { CliArgs } from '../cli-args.ts';
import { fetchEntries } from '../contentful/read.ts';
import { contentTypeOf, makeTitleOf } from '../core/entries.ts';
import { compareEntryFields } from '../core/entry-compare.ts';
import { entryComparisonReport } from '../report/markdown.ts';
import { offerReport, reportName } from '../report/save.ts';
import { selectEntryIds } from '../selection/entries.ts';
import { printTitle } from '../ui/header.ts';
import { withStatus } from '../ui/status.ts';
import { type EntryComparisonItem, renderEntryComparisons } from '../ui/views/entry-diff.ts';
import { finishReading, openContext } from './context.ts';

export async function compareEntry(args: CliArgs): Promise<number> {
  printTitle('Comparar entries', { note: 'solo lectura' });
  const ctx = await openContext(args);
  const ids = await selectEntryIds(ctx, args, { allowMissing: false });
  if (!ids.length) return finishReading(ctx, 'No se eligió ninguna entry.');

  const [srcEntries, dstEntries, srcCTs, srcLocales] = await withStatus(
    'Leyendo las entries en ambos ambientes…',
    ctx.animate,
    () =>
      Promise.all([
        fetchEntries(ctx.cma, ctx.src, ids),
        fetchEntries(ctx.cma, ctx.dst, ids),
        ctx.contentTypes(ctx.src),
        ctx.locales(ctx.src),
      ]),
    ([src, dst]) => `${src.size} en ${ctx.src} · ${dst.size} en ${ctx.dst}`,
  );
  const titleOf = makeTitleOf(srcCTs, srcLocales.default);
  const items: EntryComparisonItem[] = ids.map((id) => {
    const src = srcEntries.get(id);
    const dst = dstEntries.get(id);
    const contentType = src ? contentTypeOf(src) : '';
    return {
      id,
      title: src ? titleOf(src) : id,
      contentType,
      src,
      dst,
      fields: src && dst ? compareEntryFields(src, dst, srcCTs.get(contentType)) : [],
    };
  });
  renderEntryComparisons(items, ctx);

  await offerReport(args, reportName('entries', ctx.src, ctx.dst), () =>
    entryComparisonReport(
      items.map((i) => ({ ...i, exists: { src: Boolean(i.src), dst: Boolean(i.dst) } })),
      ctx,
    ),
  );
  return finishReading(ctx, 'Comparación lista.');
}

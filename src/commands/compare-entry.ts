/** `cfm compare-entry`: una o varias entries campo por campo entre dos ambientes. Solo lectura. */
import { type CliArgs, repeatCommand } from '../cli-args.ts';
import { fetchEntries } from '../contentful/read.ts';
import { contentTypeOf, makeTitleOf } from '../core/entries.ts';
import { compareEntryFields } from '../core/entry-compare.ts';
import { entryComparisonReport } from '../report/markdown.ts';
import { offerReport, reportName } from '../report/save.ts';
import { selectEntryIds } from '../selection/entries.ts';
import { printTitle } from '../ui/header.ts';
import { steps } from '../ui/navigation.ts';
import { withStatus } from '../ui/status.ts';
import { type EntryComparisonItem, renderEntryComparisons } from '../ui/views/entry-diff.ts';
import { contextSteps, finishReading } from './context.ts';

export async function compareEntry(args: CliArgs): Promise<number> {
  printTitle('Comparar entries', { note: 'solo lectura' });
  const context = contextSteps(args);
  let ids: string[] = [];
  const code = await steps([
    ...context.steps,
    async () => {
      const ctx = context.ctx();
      ids = await selectEntryIds(ctx, args, { allowMissing: false });
      if (!ids.length) return finishReading(ctx, 'No se eligió ninguna entry.');
    },
    async () => {
      const ctx = context.ctx();
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
      const repeat = repeatCommand('compare-entry', { spaceId: ctx.spaceId, src: ctx.src, dst: ctx.dst, ids });
      return finishReading(ctx, 'Comparación lista.', repeat);
    },
  ]);
  return code ?? 0;
}

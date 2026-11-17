import { type Entry, type FieldComparison, summarizeValue, VALUE, type ValueStatus } from 'cmtool-core';
import pc from 'picocolors';
import { log } from '../log.ts';
import { clip, table } from '../table.ts';
import { route } from './shared.ts';

const VALUE_LABEL: Record<ValueStatus, string> = {
  [VALUE.SAME]: pc.green('igual'),
  [VALUE.DIFFERENT]: pc.yellow('distinto'),
  [VALUE.ONLY_SRC]: pc.yellow('solo en origen'),
  [VALUE.ONLY_DST]: pc.cyan('solo en destino'),
};

export interface EntryComparisonItem {
  id: string;
  title: string;
  contentType: string;
  src: Entry | undefined;
  dst: Entry | undefined;
  fields: FieldComparison[];
}

/** Una tabla por entry: valor en cada ambiente y si coincide. */
export function renderEntryComparisons(items: EntryComparisonItem[], { src, dst }: { src: string; dst: string }): void {
  log.step(`Entries  ${route(src, dst)}`);
  for (const item of items) {
    const name = `${pc.bold(clip(item.title, 40))} ${pc.dim(`${item.contentType} · ${item.id}`)}`;
    if (!item.src) {
      log.warn(`${name}: no existe en ${src}.`);
      continue;
    }
    if (!item.dst) {
      log.warn(`${name}: no existe en ${dst} (se crearía al migrar).`);
      continue;
    }
    const different = item.fields.filter((f) => f.status !== VALUE.SAME);
    if (!different.length) {
      log.ok(`${name}: igual en ${src} y ${dst}.`);
      continue;
    }
    table({
      spacing: 1,
      title: `${name}  ${pc.yellow(`${different.length} campo(s) distinto(s)`)}`,
      columns: [{ header: 'Campo' }, { header: src }, { header: dst }, { header: 'Estado' }],
      rows: item.fields.map((f) => [
        clip(f.name, 26),
        summarizeValue(f.src, 34),
        summarizeValue(f.dst, 34),
        VALUE_LABEL[f.status],
      ]),
    });
  }
}

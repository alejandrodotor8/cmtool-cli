import pc from 'picocolors';
import {
  type ContentTypeDiff,
  FIELD,
  type FieldRow,
  type FieldStatus,
  fieldType,
  type ModelComparison,
} from '../../core/model.ts';
import { log } from '../log.ts';
import { clip, legend, MARK, table } from '../table.ts';
import { contentTypeStatusParts, fieldStatusText } from '../text.ts';
import { envColumns, route } from './shared.ts';

/** Marca en cada ambiente y color del estado, según cómo está el campo en destino. */
const FIELD_STYLE: Record<FieldStatus, { src: string; dst: string; color: (s: string) => string }> = {
  [FIELD.OK]: { src: MARK.yes, dst: MARK.yes, color: pc.green },
  [FIELD.RULES]: { src: MARK.yes, dst: MARK.rules, color: pc.yellow },
  [FIELD.MISSING]: { src: MARK.yes, dst: MARK.no, color: pc.yellow },
  [FIELD.MISMATCH]: { src: MARK.yes, dst: MARK.diff, color: pc.red },
  [FIELD.EXTRA]: { src: MARK.no, dst: MARK.yes, color: pc.cyan },
};

function fieldRow(row: FieldRow, index: number, dst: string, dstDefault: string | undefined): string[] {
  const style = FIELD_STYLE[row.status];
  return [
    pc.dim(row.status === FIELD.EXTRA ? '·' : String(index + 1)),
    clip(row.field.name, 28),
    pc.dim(row.field.id),
    fieldType(row.field),
    style.src,
    style.dst,
    style.color(fieldStatusText(row, dst, dstDefault)),
  ];
}

/** "2 falta(n) · 1 sobra(n)" con colores, o "al día". */
function statusBadges(diff: ContentTypeDiff, dst: string): string {
  const parts = contentTypeStatusParts(diff, dst);
  return parts.length ? pc.yellow(parts.join(pc.dim(' · '))) : pc.green('al día');
}

export interface ModelView {
  src: string;
  dst: string;
  /** Locale por defecto de destino (para explicar qué se copia en campos no localizados). */
  dstDefault: string | undefined;
}

/**
 * Una tabla por content type, campo por campo, en el orden del modelo de origen.
 * `usedBy` (opcional) agrega debajo qué entries usan cada content type.
 */
export function renderModelDiffs(
  diffs: Iterable<ContentTypeDiff>,
  { src, dst, dstDefault }: ModelView,
  usedBy?: (ctId: string) => string[],
): void {
  log.step(`Modelo  ${pc.bold(src)} ${pc.dim('vs')} ${pc.bold(dst)}`);
  legend();
  for (const diff of diffs) {
    table({
      spacing: 1,
      title: `${pc.bold(diff.name)} ${pc.dim(diff.id)}  ${statusBadges(diff, dst)}`,
      columns: [
        { header: '#' },
        { header: 'Campo' },
        { header: 'ID' },
        { header: 'Tipo' },
        ...envColumns(src, dst),
        { header: 'Estado' },
      ],
      rows: diff.rows.map((row, i) => fieldRow(row, i, dst, dstDefault)),
    });
    const users = usedBy?.(diff.id);
    if (users?.length) log.info(`usado por: ${clip(users.join(', '), 90)}`);
  }
}

/** Una fila por content type: cuántos campos tiene y en qué se diferencia de destino. */
export function renderModelOverview(
  { diffs, onlyInDst }: ModelComparison,
  { src, dst }: Pick<ModelView, 'src' | 'dst'>,
) {
  const rows = [
    ...diffs.map((d) => [pc.bold(clip(d.name, 34)), pc.dim(d.id), String(d.rows.length), statusBadges(d, dst)]),
    ...onlyInDst.map((ct) => [
      clip(ct.name, 34),
      pc.dim(ct.sys.id),
      String(ct.fields.length),
      pc.cyan(`solo existe en ${dst}`),
    ]),
  ];
  table({
    spacing: 1,
    title: `${route(src, dst)}  ${pc.dim(`${diffs.length + onlyInDst.length} content type(s)`)}`,
    columns: [
      { header: 'Content type' },
      { header: 'ID' },
      { header: 'Campos', align: 'center' },
      { header: 'Estado' },
    ],
    rows,
  });
}

/** Campos con otra apariencia del editor en destino (help text, widget), por content type. */
export function renderEditorDiffs(editorDiffs: Map<string, string[]>, diffs: ContentTypeDiff[], dst: string): void {
  const byId = new Map(diffs.map((d) => [d.id, d]));
  const lines = [...editorDiffs].map(([ctId, ids]) => {
    const diff = byId.get(ctId);
    const names = new Map(diff?.rows.map((r) => [r.field.id, r.field.name]));
    return `${pc.bold(diff?.name ?? ctId)} ${pc.dim(ctId)}: ${ids.map((id) => names.get(id) ?? id).join(', ')}`;
  });
  log.warn(`Apariencia del editor distinta en ${dst} (help text, widget):`);
  log.block(lines.join('\n'));
}

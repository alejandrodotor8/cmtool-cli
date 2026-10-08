import pc from 'picocolors';
import type { EditorFieldDiff } from '../../core/editor.ts';
import {
  type ContentTypeDiff,
  FIELD,
  type FieldRow,
  type FieldStatus,
  fieldType,
  type ModelComparison,
} from '../../core/model.ts';
import type { EditorDiffs } from '../../core/model-changes.ts';
import { log } from '../log.ts';
import { clip, legend, MARK, table } from '../table.ts';
import { contentTypeStatusParts, ctInfoText, fieldStatusText } from '../text.ts';
import { envColumns, route } from './shared.ts';

/** Marca en cada ambiente y color del estado, según cómo está el campo en destino. */
const FIELD_STYLE: Record<FieldStatus, { src: string; dst: string; color: (s: string) => string }> = {
  [FIELD.OK]: { src: MARK.yes, dst: MARK.yes, color: pc.green },
  [FIELD.RULES]: { src: MARK.yes, dst: MARK.rules, color: pc.yellow },
  [FIELD.MISSING]: { src: MARK.yes, dst: MARK.no, color: pc.yellow },
  [FIELD.MISMATCH]: { src: MARK.yes, dst: MARK.diff, color: pc.red },
  [FIELD.EXTRA]: { src: MARK.no, dst: MARK.yes, color: pc.cyan },
};

/** Un campo al día en el modelo pero con otra apariencia del editor se marca como reglas distintas. */
const EDITOR_STYLE = FIELD_STYLE[FIELD.RULES];

function fieldRow(
  row: FieldRow,
  index: number,
  { dst, dstDefault }: ModelView,
  editorDiff: EditorFieldDiff | undefined,
): string[] {
  const style = editorDiff && row.status === FIELD.OK ? EDITOR_STYLE : FIELD_STYLE[row.status];
  return [
    pc.dim(row.status === FIELD.EXTRA ? '·' : String(index + 1)),
    clip(row.field.name, 28),
    pc.dim(row.field.id),
    fieldType(row.field),
    style.src,
    style.dst,
    style.color(fieldStatusText(row, dst, dstDefault, editorDiff)),
  ];
}

/** "2 falta(n) · 1 con otra apariencia" con colores, o "al día". */
function statusBadges(diff: ContentTypeDiff, dst: string, editorDiffs: EditorDiffs | undefined): string {
  const parts = contentTypeStatusParts(diff, dst, editorDiffs?.get(diff.id)?.length);
  return parts.length ? pc.yellow(parts.join(pc.dim(' · '))) : pc.green('al día');
}

export interface ModelView {
  src: string;
  dst: string;
  /** Locale por defecto de destino (para explicar qué se copia en campos no localizados). */
  dstDefault: string | undefined;
  /** Campos con otra apariencia del editor en destino (help text, widget), por content type. */
  editorDiffs?: EditorDiffs;
}

/**
 * Una tabla por content type, campo por campo, en el orden del modelo de origen.
 * `usedBy` (opcional) agrega debajo qué entries usan cada content type.
 */
export function renderModelDiffs(
  diffs: Iterable<ContentTypeDiff>,
  view: ModelView,
  usedBy?: (ctId: string) => string[],
): void {
  const { src, dst, editorDiffs } = view;
  log.step(`Modelo  ${pc.bold(src)} ${pc.dim('vs')} ${pc.bold(dst)}`);
  legend();
  for (const diff of diffs) {
    const editorByField = new Map(editorDiffs?.get(diff.id)?.map((e) => [e.fieldId, e]));
    table({
      spacing: 1,
      title: `${pc.bold(diff.name)} ${pc.dim(diff.id)}  ${statusBadges(diff, dst, editorDiffs)}`,
      columns: [
        { header: '#' },
        { header: 'Campo' },
        { header: 'ID' },
        { header: 'Tipo' },
        ...envColumns(src, dst),
        { header: 'Estado' },
      ],
      rows: diff.rows.map((row, i) => fieldRow(row, i, view, editorByField.get(row.field.id))),
    });
    if (diff.info.length) log.info(ctInfoText(diff, dst));
    const users = usedBy?.(diff.id);
    if (users?.length) log.info(`usado por: ${clip(users.join(', '), 90)}`);
  }
}

/** Una fila por content type: cuántos campos tiene y en qué se diferencia de destino. */
export function renderModelOverview(
  { diffs, onlyInDst }: ModelComparison,
  { src, dst, editorDiffs }: Pick<ModelView, 'src' | 'dst' | 'editorDiffs'>,
) {
  const rows = [
    ...diffs.map((d) => [
      pc.bold(clip(d.name, 34)),
      pc.dim(d.id),
      String(d.rows.length),
      statusBadges(d, dst, editorDiffs),
    ]),
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

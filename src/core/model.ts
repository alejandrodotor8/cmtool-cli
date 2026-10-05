import type { ContentType, Field } from '../contentful/types.ts';

/** Firma del tipo de un campo: si cambia entre ambientes, los valores no son compatibles. */
export const fieldSig = (f: Field): string => [f.type, f.linkType, f.items?.type, f.items?.linkType].join('|');

export const fieldType = (f: Field): string =>
  f.type === 'Link'
    ? `Link ${f.linkType}`
    : f.type === 'Array'
      ? `Array<${f.items?.linkType ?? f.items?.type}>`
      : f.type;

export const FIELD = {
  OK: 'ok', // existe en ambos con el mismo tipo
  MISSING: 'missing', // falta en destino
  MISMATCH: 'mismatch', // existe en ambos con distinto tipo
  EXTRA: 'extra', // solo existe en destino
} as const;

export type FieldStatus = (typeof FIELD)[keyof typeof FIELD];

export interface FieldRow {
  field: Field;
  dstField: Field | undefined;
  status: FieldStatus;
}

export interface ContentTypeDiff {
  id: string;
  name: string;
  /** El content type no existe en destino. */
  missingCT: boolean;
  /** Campos en el orden del modelo de origen; los que sobran en destino van al final. */
  rows: FieldRow[];
  missing: Field[];
  extra: Field[];
  mismatched: Field[];
}

/** Compara un content type de origen con el de destino (`undefined` si no existe allá). */
export function diffContentType(srcCT: ContentType, dstCT: ContentType | undefined): ContentTypeDiff {
  const dstById = new Map((dstCT?.fields ?? []).map((f) => [f.id, f]));
  const srcIds = new Set(srcCT.fields.map((f) => f.id));

  const rows: FieldRow[] = srcCT.fields.map((field) => {
    const dstField = dstById.get(field.id);
    const status = !dstField ? FIELD.MISSING : fieldSig(field) !== fieldSig(dstField) ? FIELD.MISMATCH : FIELD.OK;
    return { field, dstField, status };
  });
  for (const field of dstCT?.fields ?? []) {
    if (!srcIds.has(field.id)) rows.push({ field, dstField: field, status: FIELD.EXTRA });
  }

  const fieldsWith = (status: FieldStatus) => rows.filter((r) => r.status === status).map((r) => r.field);
  return {
    id: srcCT.sys.id,
    name: srcCT.name,
    missingCT: !dstCT,
    rows,
    missing: fieldsWith(FIELD.MISSING),
    extra: fieldsWith(FIELD.EXTRA),
    mismatched: fieldsWith(FIELD.MISMATCH),
  };
}

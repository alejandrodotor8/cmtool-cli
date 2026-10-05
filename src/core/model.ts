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
  OK: 'ok', // existe en ambos, igual
  RULES: 'rules', // mismo tipo, pero cambian reglas (obligatorio, localizado, validaciones)
  MISSING: 'missing', // falta en destino
  MISMATCH: 'mismatch', // existe en ambos con distinto tipo
  EXTRA: 'extra', // solo existe en destino
} as const;

export type FieldStatus = (typeof FIELD)[keyof typeof FIELD];

/** Diferencias de reglas entre un campo de origen y el mismo campo en destino. */
export interface RuleChanges {
  /** Obligatorio en destino pero no en origen: si queda vacío, la entry no se podrá publicar. */
  requiredOnlyInDst: boolean;
  /** Localizado en origen pero no en destino: solo se copia el locale por defecto. */
  localizationLost: boolean;
  /** Validaciones que cambian, por nombre (`size`, `linkContentType`, `items.linkContentType`…). */
  validations: string[];
}

export interface FieldRow {
  field: Field;
  dstField: Field | undefined;
  status: FieldStatus;
  /** Solo cuando `status` es RULES. */
  rules?: RuleChanges;
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
  /** Mismo tipo, reglas distintas. */
  changedRules: Field[];
}

/** JSON estable: los arrays de valores simples se ordenan, para que el orden no cuente como diferencia. */
const stableJson = (value: unknown): string =>
  JSON.stringify(value, (_, v) =>
    Array.isArray(v) && v.every((x) => typeof x !== 'object') ? [...v].sort() : (v as unknown),
  );

/** Validaciones de un campo (y de sus items, si es un Array) por nombre. Ignora los mensajes. */
function validationsOf(f: Field): Map<string, string> {
  const out = new Map<string, string>();
  const add = (list: object[] | undefined, prefix: string) => {
    for (const validation of list ?? []) {
      for (const [name, value] of Object.entries(validation)) {
        if (name !== 'message') out.set(prefix + name, stableJson(value));
      }
    }
  };
  add(f.validations, '');
  add(f.items?.validations, 'items.');
  return out;
}

/** Compara las reglas de un campo con el mismo tipo en ambos ambientes. `undefined` si son iguales. */
export function compareRules(src: Field, dst: Field): RuleChanges | undefined {
  const srcValidations = validationsOf(src);
  const dstValidations = validationsOf(dst);
  const names = new Set([...srcValidations.keys(), ...dstValidations.keys()]);
  const rules: RuleChanges = {
    requiredOnlyInDst: dst.required && !src.required,
    localizationLost: src.localized && !dst.localized,
    validations: [...names].filter((name) => srcValidations.get(name) !== dstValidations.get(name)),
  };
  return rules.requiredOnlyInDst || rules.localizationLost || rules.validations.length ? rules : undefined;
}

/** Compara un content type de origen con el de destino (`undefined` si no existe allá). */
export function diffContentType(srcCT: ContentType, dstCT: ContentType | undefined): ContentTypeDiff {
  const dstById = new Map((dstCT?.fields ?? []).map((f) => [f.id, f]));
  const srcIds = new Set(srcCT.fields.map((f) => f.id));

  const rows: FieldRow[] = srcCT.fields.map((field) => {
    const dstField = dstById.get(field.id);
    if (!dstField) return { field, dstField, status: FIELD.MISSING };
    if (fieldSig(field) !== fieldSig(dstField)) return { field, dstField, status: FIELD.MISMATCH };
    const rules = compareRules(field, dstField);
    return rules ? { field, dstField, status: FIELD.RULES, rules } : { field, dstField, status: FIELD.OK };
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
    changedRules: fieldsWith(FIELD.RULES),
  };
}

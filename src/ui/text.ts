/**
 * Textos (sin color) que comparten la terminal y los reportes en Markdown.
 */
import type { BackupData } from '../backup.ts';
import { type ContentTypeDiff, FIELD, type FieldRow, fieldType, type RuleChanges } from '../core/model.ts';

export const BACKUP_KIND_LABEL: Record<BackupData['kind'], string> = {
  migrate: 'migración',
  model: 'modelo',
  assets: 'imágenes',
  restore: 'restore',
};

/** Nombres legibles de las validaciones de Contentful. */
const VALIDATION_LABEL: Record<string, string> = {
  linkContentType: 'tipos de entry permitidos',
  linkMimetypeGroup: 'tipo de archivo',
  size: 'tamaño',
  range: 'rango',
  in: 'valores permitidos',
  regexp: 'formato',
  prohibitRegexp: 'formato prohibido',
  unique: 'único',
  dateRange: 'rango de fechas',
  assetFileSize: 'peso del archivo',
  assetImageDimensions: 'dimensiones de imagen',
  enabledNodeTypes: 'bloques de rich text',
  enabledMarks: 'formatos de rich text',
  nodes: 'links en rich text',
};

const validationLabel = (name: string) => {
  const base = name.replace(/^items\./, '');
  return VALIDATION_LABEL[base] ?? base;
};

/** Las reglas que cambian en destino. */
function rulesText(rules: RuleChanges, dst: string, dstDefault: string | undefined): string {
  return [
    rules.requiredOnlyInDst && `obligatorio en ${dst}`,
    rules.localizationLost && `no localizado en ${dst}: solo se copia ${dstDefault ?? 'el locale por defecto'}`,
    rules.validations.length && `validaciones: ${[...new Set(rules.validations.map(validationLabel))].join(', ')}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Estado de un campo comparado con destino. */
export function fieldStatusText({ status, dstField, rules }: FieldRow, dst: string, dstDefault: string | undefined) {
  switch (status) {
    case FIELD.OK:
      return 'al día';
    case FIELD.RULES:
      return rules ? rulesText(rules, dst, dstDefault) : 'reglas distintas';
    case FIELD.MISSING:
      return `falta en ${dst}`;
    case FIELD.MISMATCH:
      return `en ${dst} es ${dstField ? fieldType(dstField) : '?'} → no se migra`;
    case FIELD.EXTRA:
      return `sobra en ${dst} → se conserva`;
  }
}

/** Resumen de un content type comparado con destino ("2 falta(n) · 1 sobra(n)", "al día"…). */
export function contentTypeStatusParts(diff: ContentTypeDiff, dst: string): string[] {
  if (diff.missingCT) return [`no existe en ${dst}`];
  return [
    diff.missing.length && `${diff.missing.length} falta(n)`,
    diff.extra.length && `${diff.extra.length} sobra(n)`,
    diff.mismatched.length && `${diff.mismatched.length} otro tipo`,
    diff.changedRules.length && `${diff.changedRules.length} con reglas distintas`,
  ].filter((part): part is string => Boolean(part));
}

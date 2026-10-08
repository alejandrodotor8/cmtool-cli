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

/** Lo que se muestra cuando un campo tiene otra apariencia del editor en destino. */
export const EDITOR_DIFF_TEXT = 'help text o widget distinto';

/**
 * Estado de un campo comparado con destino. `editorDiff`: el campo tiene otra apariencia
 * del editor en destino (no es parte del modelo, pero tampoco está al día).
 */
export function fieldStatusText(
  { status, dstField, rules }: FieldRow,
  dst: string,
  dstDefault: string | undefined,
  editorDiff = false,
) {
  switch (status) {
    case FIELD.OK:
      return editorDiff ? EDITOR_DIFF_TEXT : 'al día';
    case FIELD.RULES:
      return [rules ? rulesText(rules, dst, dstDefault) : 'reglas distintas', editorDiff && EDITOR_DIFF_TEXT]
        .filter(Boolean)
        .join(' · ');
    case FIELD.MISSING:
      return `falta en ${dst}`;
    case FIELD.MISMATCH:
      return `en ${dst} es ${dstField ? fieldType(dstField) : '?'} → no se migra`;
    case FIELD.EXTRA:
      return `sobra en ${dst} → se conserva`;
  }
}

/**
 * Resumen de un content type comparado con destino ("2 falta(n) · 1 sobra(n)"…; vacío si
 * está al día). `editorFields`: cuántos campos tienen otra apariencia del editor.
 */
export function contentTypeStatusParts(diff: ContentTypeDiff, dst: string, editorFields = 0): string[] {
  if (diff.missingCT) return [`no existe en ${dst}`];
  return [
    diff.missing.length && `${diff.missing.length} falta(n)`,
    diff.extra.length && `${diff.extra.length} sobra(n)`,
    diff.mismatched.length && `${diff.mismatched.length} otro tipo`,
    diff.changedRules.length && `${diff.changedRules.length} con reglas distintas`,
    editorFields && `${editorFields} con otro help text o widget`,
  ].filter((part): part is string => Boolean(part));
}

/**
 * La pregunta de cambios de modelo según lo que haya: content types que no existen en
 * destino (se crean), campos que faltan (se agregan) y campos con otra apariencia del
 * editor (se actualizan; vienen marcados).
 */
export function modelChangesQuestion(
  options: { diff: { missingCT: boolean; missing: unknown[] }; editorFields: string[] }[],
  dst: string,
) {
  const newCTs = options.filter((o) => o.diff.missingCT).length;
  const add = options.some((o) => !o.diff.missingCT && o.diff.missing.length > 0);
  const update = options.some((o) => o.editorFields.length > 0);
  const verb = add && update ? 'agrego o actualizo' : update ? 'actualizo' : 'agrego';
  const howTo = update
    ? 'la apariencia viene marcada: espacio para desmarcar'
    : 'sin marcar nada, el modelo no se toca';

  if (newCTs && !add && !update) {
    return {
      question:
        newCTs === 1
          ? `Este content type no existe en ${dst}: ¿lo creo?`
          : `Estos ${newCTs} content types no existen en ${dst}: ¿cuáles creo?`,
      note: 'sin marcar nada, no se crea ninguno',
    };
  }
  if (newCTs) {
    return {
      question: `¿Qué creo o ${verb} en el modelo de ${dst}?`,
      note: `${newCTs} content type(s) nuevo(s); ${howTo}`,
    };
  }
  return {
    question: add && !update ? `¿Qué campos agrego al modelo de ${dst}?` : `¿Qué ${verb} en el modelo de ${dst}?`,
    note: howTo,
  };
}

/**
 * Cambios de modelo que elige el usuario (crear content types, agregar campos).
 * Lo usan "migrar entries" y "migrar modelo". Funciones puras.
 */
import type { ContentType, Field } from '../contentful/types.ts';
import type { ContentTypeDiff } from './model.ts';

/** Una opción marcada: sin `field` crea el content type completo. */
export interface ModelPick {
  ctId: string;
  field?: Field;
}

export interface ModelOption {
  diff: ContentTypeDiff;
  /** Solo lo usan entries reutilizadas: se agrega al modelo, pero su contenido no se copia. */
  onlyReused: boolean;
}

export interface ModelChanges {
  contentTypesToCreate: ContentType[];
  fieldsToAdd: Map<string, Field[]>;
}

/**
 * Lo que se puede agregar al modelo de destino, por content type: content types que no
 * existen y campos que faltan. Con `written` (los content types de las entries que se
 * escriben), un content type que falta solo se ofrece si alguna de esas entries lo usa.
 */
export function modelOptions(diffs: Iterable<ContentTypeDiff>, written?: Set<string>): ModelOption[] {
  return [...diffs]
    .filter((d) => (d.missingCT ? !written || written.has(d.id) : d.missing.length > 0))
    .map((diff) => ({ diff, onlyReused: written !== undefined && !written.has(diff.id) }));
}

/** Convierte lo que marcó el usuario en cambios concretos. */
export function modelChangesFrom(picked: ModelPick[], srcCTs: Map<string, ContentType>): ModelChanges {
  const fieldsToAdd = new Map<string, Field[]>();
  for (const { ctId, field } of picked) {
    if (field) fieldsToAdd.set(ctId, [...(fieldsToAdd.get(ctId) ?? []), field]);
  }
  return {
    contentTypesToCreate: picked.filter((p) => !p.field).flatMap((p) => srcCTs.get(p.ctId) ?? []),
    fieldsToAdd,
  };
}

/** Campos que faltan en destino y no se marcaron (`contentType.campo`): su contenido no se migra. */
export function notAddedFields(diffs: Iterable<ContentTypeDiff>, fieldsToAdd: Map<string, Field[]>): string[] {
  return [...diffs].flatMap((d) =>
    d.missingCT
      ? []
      : d.missing.filter((f) => !fieldsToAdd.get(d.id)?.some((a) => a.id === f.id)).map((f) => `${d.id}.${f.id}`),
  );
}

export const countNewFields = (changes: ModelChanges): number =>
  [...changes.fieldsToAdd.values()].reduce((n, fields) => n + fields.length, 0);

export const hasModelChanges = (changes: ModelChanges): boolean =>
  changes.contentTypesToCreate.length + changes.fieldsToAdd.size > 0;

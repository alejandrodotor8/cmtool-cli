/**
 * Cambios de modelo que elige el usuario (crear content types, agregar campos, copiar la
 * apariencia del editor). Lo usan "migrar entries" y "migrar modelo". Funciones puras.
 */
import type { ContentType, Field } from '../contentful/types.ts';
import type { ContentTypeDiff } from './model.ts';

/** Una opción marcada: sin `field` ni `editor`, crea el content type completo. */
export interface ModelPick {
  ctId: string;
  field?: Field;
  /** Copiar la apariencia del editor de los campos que ya existen y difieren. */
  editor?: boolean;
}

export interface ModelOption {
  diff: ContentTypeDiff;
  /** Solo lo usan entries reutilizadas: se agrega al modelo, pero su contenido no se copia. */
  onlyReused: boolean;
  /** Campos que ya existen en destino con otra apariencia (help text, widget). */
  editorFields: string[];
}

export interface ModelChanges {
  contentTypesToCreate: ContentType[];
  fieldsToAdd: Map<string, Field[]>;
  /**
   * Campos cuya apariencia se copia, por content type: siempre los de content types creados
   * y los campos agregados, más los que el usuario marcó para actualizar.
   */
  editorFields: Map<string, Set<string>>;
}

/** Campos de cada content type con apariencia distinta en destino. */
export type EditorDiffs = Map<string, string[]>;

/**
 * Lo que se puede cambiar en el modelo de destino, por content type: content types que no
 * existen, campos que faltan y campos con otra apariencia. Con `written` (los content types
 * de las entries que se escriben), un content type que falta solo se ofrece si alguna de
 * esas entries lo usa.
 */
export function modelOptions(
  diffs: Iterable<ContentTypeDiff>,
  written?: Set<string>,
  editorDiffs: EditorDiffs = new Map(),
): ModelOption[] {
  return [...diffs]
    .map((diff) => ({
      diff,
      onlyReused: written !== undefined && !written.has(diff.id),
      editorFields: diff.missingCT ? [] : (editorDiffs.get(diff.id) ?? []),
    }))
    .filter(({ diff, editorFields }) =>
      diff.missingCT ? !written || written.has(diff.id) : diff.missing.length > 0 || editorFields.length > 0,
    );
}

/** Convierte lo que marcó el usuario en cambios concretos. */
export function modelChangesFrom(
  picked: ModelPick[],
  srcCTs: Map<string, ContentType>,
  editorDiffs: EditorDiffs = new Map(),
): ModelChanges {
  const fieldsToAdd = new Map<string, Field[]>();
  const editorFields = new Map<string, Set<string>>();
  const copyEditor = (ctId: string, ids: string[]) => {
    if (ids.length) editorFields.set(ctId, new Set([...(editorFields.get(ctId) ?? []), ...ids]));
  };

  for (const { ctId, field, editor } of picked) {
    if (field) {
      fieldsToAdd.set(ctId, [...(fieldsToAdd.get(ctId) ?? []), field]);
      copyEditor(ctId, [field.id]);
    } else if (editor) {
      copyEditor(ctId, editorDiffs.get(ctId) ?? []);
    }
  }
  const contentTypesToCreate = picked.filter((p) => !p.field && !p.editor).flatMap((p) => srcCTs.get(p.ctId) ?? []);
  for (const ct of contentTypesToCreate) {
    copyEditor(
      ct.sys.id,
      ct.fields.map((f) => f.id),
    );
  }
  return { contentTypesToCreate, fieldsToAdd, editorFields };
}

/** Campos que faltan en destino y no se marcaron (`contentType.campo`): su contenido no se migra. */
export function notAddedFields(diffs: Iterable<ContentTypeDiff>, fieldsToAdd: Map<string, Field[]>): string[] {
  return [...diffs].flatMap((d) =>
    d.missingCT
      ? []
      : d.missing.filter((f) => !fieldsToAdd.get(d.id)?.some((a) => a.id === f.id)).map((f) => `${d.id}.${f.id}`),
  );
}

export const countNewFields = (changes: Pick<ModelChanges, 'fieldsToAdd'>): number =>
  [...changes.fieldsToAdd.values()].reduce((n, fields) => n + fields.length, 0);

export const countEditorFields = (changes: Pick<ModelChanges, 'editorFields'>): number =>
  [...changes.editorFields.values()].reduce((n, ids) => n + ids.size, 0);

export const hasModelChanges = (changes: ModelChanges): boolean =>
  changes.contentTypesToCreate.length + changes.fieldsToAdd.size + changes.editorFields.size > 0;

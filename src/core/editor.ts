/**
 * Apariencia del editor (editor interface): el widget y los ajustes de cada campo, como el
 * help text. No es parte del modelo: Contentful la guarda aparte. Funciones puras.
 */
import type { EditorControl, EditorInterface } from '../contentful/types.ts';
import { stableJson } from './json.ts';
import { type ContentTypeDiff, FIELD } from './model.ts';

/** Widgets propios de Contentful: existen en todos los ambientes. */
const BUILTIN = 'builtin';

/**
 * Lo que se puede copiar de un control a otro ambiente. Un widget de Contentful se copia
 * con sus ajustes; el de una app o extensión (que podría no estar instalada en destino)
 * no: solo su help text, y destino usa el widget por defecto.
 */
export function portableControl({ fieldId, widgetId, widgetNamespace, settings }: EditorControl): EditorControl {
  if (!widgetNamespace || widgetNamespace === BUILTIN) {
    return {
      fieldId,
      ...(widgetId !== undefined && { widgetId }),
      ...(widgetNamespace !== undefined && { widgetNamespace }),
      ...(settings !== undefined && { settings }),
    };
  }
  const helpText = settings?.helpText;
  return helpText === undefined ? { fieldId } : { fieldId, settings: { helpText } };
}

const byField = (ei: EditorInterface | undefined) => new Map((ei?.controls ?? []).map((c) => [c.fieldId, c]));
const portableKey = (c: EditorControl) => stableJson({ ...portableControl(c), fieldId: undefined });

/** De `fieldIds`, los campos cuya apariencia en destino es distinta a la de origen. */
export function editorDifferences(
  src: EditorInterface | undefined,
  dst: EditorInterface | undefined,
  fieldIds: string[],
): string[] {
  const srcControls = byField(src);
  const dstControls = byField(dst);
  return fieldIds.filter((id) => {
    const srcControl = srcControls.get(id);
    if (!srcControl) return false;
    const dstControl = dstControls.get(id);
    return !dstControl || portableKey(srcControl) !== portableKey(dstControl);
  });
}

/** Los controles de destino con la apariencia de origen copiada en `fieldIds`; el resto no se toca. */
export function mergeControls(
  dstControls: EditorControl[] | undefined,
  srcControls: EditorControl[] | undefined,
  fieldIds: Set<string>,
): EditorControl[] {
  const src = new Map((srcControls ?? []).map((c) => [c.fieldId, c]));
  const copy = (id: string) => {
    const control = src.get(id);
    return control && fieldIds.has(id) ? portableControl(control) : undefined;
  };
  const merged = (dstControls ?? []).map((c) => copy(c.fieldId) ?? c);
  const present = new Set(merged.map((c) => c.fieldId));
  for (const id of fieldIds) {
    const control = copy(id);
    if (control && !present.has(id)) merged.push(control);
  }
  return merged;
}

/**
 * Por content type, los campos que existen en ambos modelos (mismo tipo) pero tienen otra
 * apariencia en destino. Los content types que no existen en destino no se incluyen.
 */
export function editorDiffsFor(
  diffs: Iterable<ContentTypeDiff>,
  src: Map<string, EditorInterface>,
  dst: Map<string, EditorInterface>,
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const diff of diffs) {
    if (diff.missingCT) continue;
    const shared = diff.rows.filter((r) => r.status === FIELD.OK || r.status === FIELD.RULES).map((r) => r.field.id);
    const ids = editorDifferences(src.get(diff.id), dst.get(diff.id), shared);
    if (ids.length) result.set(diff.id, ids);
  }
  return result;
}

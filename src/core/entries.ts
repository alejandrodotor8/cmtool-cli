import type { ContentType, Entry } from '../contentful/types.ts';

export interface LinkRef {
  type: 'Entry' | 'Asset';
  id: string;
}

/** Recorre cualquier valor (campos, arrays, rich text) y devuelve los links a Entry o Asset. */
export function collectLinks(value: unknown, out: LinkRef[] = []): LinkRef[] {
  if (Array.isArray(value)) {
    for (const v of value) collectLinks(v, out);
  } else if (value && typeof value === 'object') {
    const sys = (value as { sys?: { type?: string; linkType?: string; id?: string } }).sys;
    if (sys?.type === 'Link' && (sys.linkType === 'Entry' || sys.linkType === 'Asset') && sys.id) {
      out.push({ type: sys.linkType, id: sys.id });
    } else {
      for (const v of Object.values(value)) collectLinks(v, out);
    }
  }
  return out;
}

const linkedIds = (entry: Entry, type: LinkRef['type']): string[] => [
  ...new Set(
    collectLinks(entry.fields)
      .filter((l) => l.type === type)
      .map((l) => l.id),
  ),
];

/** IDs de las entries a las que apunta (sus hijos). */
export const childEntryIds = (entry: Entry): string[] => linkedIds(entry, 'Entry');

/** IDs de las imágenes y archivos que usa. */
export const assetIdsOf = (entry: Entry): string[] => linkedIds(entry, 'Asset');

export const contentTypeOf = (entry: Entry): string => entry.sys.contentType.sys.id;

/** Título legible de una entry según el displayField de su content type. */
export const makeTitleOf =
  (contentTypes: Map<string, ContentType>, locale: string | undefined) =>
  (entry: Entry): string => {
    const displayField = contentTypes.get(contentTypeOf(entry))?.displayField;
    const value: Record<string, unknown> | undefined = displayField ? entry.fields?.[displayField] : undefined;
    const title = (locale ? value?.[locale] : undefined) ?? (value && Object.values(value)[0]);
    return typeof title === 'string' ? title : '(sin título)';
  };

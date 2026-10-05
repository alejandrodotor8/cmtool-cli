/** Recorre cualquier valor (campos, arrays, rich text) y devuelve los links a Entry o Asset. */
export function collectLinks(value, out = []) {
  if (Array.isArray(value)) value.forEach((v) => collectLinks(v, out));
  else if (value && typeof value === 'object') {
    const sys = value.sys;
    if (sys?.type === 'Link' && (sys.linkType === 'Entry' || sys.linkType === 'Asset')) {
      out.push({ type: sys.linkType, id: sys.id });
    } else {
      Object.values(value).forEach((v) => collectLinks(v, out));
    }
  }
  return out;
}

const linkedIds = (entry, type) => [
  ...new Set(
    collectLinks(entry.fields)
      .filter((l) => l.type === type)
      .map((l) => l.id),
  ),
];

/** IDs de las entries a las que apunta (sus hijos). */
export const childEntryIds = (entry) => linkedIds(entry, 'Entry');

/** IDs de las imágenes y archivos que usa. */
export const assetIdsOf = (entry) => linkedIds(entry, 'Asset');

export const contentTypeOf = (entry) => entry.sys.contentType.sys.id;

/** Título legible de una entry según el displayField de su content type. */
export const makeTitleOf = (contentTypes, locale) => (entry) => {
  const ct = contentTypes.get(contentTypeOf(entry));
  const value = entry.fields?.[ct?.displayField];
  const title = value?.[locale] ?? (value && Object.values(value)[0]);
  return typeof title === 'string' ? title : '(sin título)';
};

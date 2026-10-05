/**
 * Transforma valores de origen al formato que acepta destino. Funciones puras.
 * `locales` = { codes: Set, default: string }, como lo devuelve readLocales.
 */

const pickLocales = (byLocale, keep) =>
  Object.fromEntries(Object.entries(byLocale ?? {}).filter(([locale]) => keep(locale)));

const isEmpty = (obj) => Object.keys(obj).length === 0;

/**
 * Valores de una entry de origen listos para destino.
 * - Solo los campos de `writable` (existen en ambos modelos con el mismo tipo).
 * - Campo localizado en destino: solo los locales que existan en destino.
 * - Campo no localizado en destino: solo su locale por defecto.
 */
export function fieldsForDestination(entry, writable, dstLocales) {
  const out = {};
  for (const [id, byLocale] of Object.entries(entry.fields ?? {})) {
    const field = writable.get(id);
    if (!field) continue;
    const value = field.localized
      ? pickLocales(byLocale, (l) => dstLocales.codes.has(l))
      : pickLocales(byLocale, (l) => l === dstLocales.default);
    if (!isEmpty(value)) out[id] = value;
  }
  return out;
}

/**
 * Mezcla con la entry que ya existe en destino. En los campos que se migran manda el
 * origen; lo que solo existe en destino (campos de sobra, de otro tipo o locales que
 * origen no tiene) se conserva.
 */
export function mergeWithExisting(current, incoming, writable, srcLocales) {
  const merged = { ...current };
  for (const id of writable.keys()) {
    const value = { ...pickLocales(current[id], (l) => !srcLocales.codes.has(l)), ...(incoming[id] ?? {}) };
    if (isEmpty(value)) delete merged[id];
    else merged[id] = value;
  }
  return merged;
}

/** Archivo, título y descripción de un asset de origen, para crearlo igual en destino. */
export function assetFieldsForDestination(asset, dstLocales) {
  const inDst = (l) => dstLocales.codes.has(l);
  const file = {};
  for (const [locale, f] of Object.entries(pickLocales(asset.fields.file, inDst))) {
    file[locale] = { contentType: f.contentType, fileName: f.fileName, upload: contentfulFileUrl(f) };
  }
  const fields = { file };
  if (asset.fields.title) fields.title = pickLocales(asset.fields.title, inDst);
  if (asset.fields.description) fields.description = pickLocales(asset.fields.description, inDst);
  return fields;
}

/**
 * URL https del archivo en el CDN de Contentful (*.ctfassets.net). Destino descarga el
 * archivo desde ahí; cualquier otro origen se rechaza.
 */
function contentfulFileUrl(file) {
  const raw = file.url ?? file.upload ?? '';
  const url = raw.startsWith('//') ? `https:${raw}` : raw;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    /* se rechaza abajo */
  }
  if (parsed?.protocol !== 'https:' || !parsed.hostname.endsWith('.ctfassets.net')) {
    throw new Error(`el archivo no está en el CDN de Contentful (${url || 'sin URL'})`);
  }
  return url;
}

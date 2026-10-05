/**
 * Transforma valores de origen al formato que acepta destino. Funciones puras.
 */
import type { Asset, Entry, Field, Locales } from '../contentful/types.ts';

type ByLocale<T = unknown> = Record<string, T>;

const pickLocales = <T>(byLocale: ByLocale<T> | undefined, keep: (locale: string) => boolean): ByLocale<T> =>
  Object.fromEntries(Object.entries(byLocale ?? {}).filter(([locale]) => keep(locale)));

const isEmpty = (obj: object): boolean => Object.keys(obj).length === 0;

/**
 * Valores de una entry de origen listos para destino.
 * - Solo los campos de `writable` (existen en ambos modelos con el mismo tipo).
 * - Campo localizado en destino: solo los locales que existan en destino.
 * - Campo no localizado en destino: solo su locale por defecto.
 */
export function fieldsForDestination(entry: Entry, writable: Map<string, Field>, dstLocales: Locales): Entry['fields'] {
  const out: Entry['fields'] = {};
  for (const [id, byLocale] of Object.entries<ByLocale>(entry.fields ?? {})) {
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
export function mergeWithExisting(
  current: Entry['fields'],
  incoming: Entry['fields'],
  writable: Map<string, Field>,
  srcLocales: Locales,
): Entry['fields'] {
  const merged: Entry['fields'] = { ...current };
  for (const id of writable.keys()) {
    const value = { ...pickLocales(current[id], (l) => !srcLocales.codes.has(l)), ...incoming[id] };
    if (isEmpty(value)) delete merged[id];
    else merged[id] = value;
  }
  return merged;
}

/** Archivo, título y descripción de un asset de origen, para crearlo igual en destino. */
export function assetFieldsForDestination(asset: Asset, dstLocales: Locales): Asset['fields'] {
  const inDst = (l: string) => dstLocales.codes.has(l);
  const file: Asset['fields']['file'] = {};
  for (const [locale, f] of Object.entries(pickLocales(asset.fields.file, inDst))) {
    file[locale] = { contentType: f.contentType, fileName: f.fileName, upload: contentfulFileUrl(f) };
  }
  const fields = {
    file,
    ...(asset.fields.title && { title: pickLocales(asset.fields.title, inDst) }),
    ...(asset.fields.description && { description: pickLocales(asset.fields.description, inDst) }),
  };
  // El tipo marca `title` como obligatorio, pero un asset sin título no lo trae; se envía igual que en origen.
  return fields as Asset['fields'];
}

/**
 * URL https del archivo en el CDN de Contentful (*.ctfassets.net). Destino descarga el
 * archivo desde ahí; cualquier otro origen se rechaza.
 */
function contentfulFileUrl(file: { url?: string; upload?: string }): string {
  const raw = file.url ?? file.upload ?? '';
  const url = raw.startsWith('//') ? `https:${raw}` : raw;
  let parsed: URL | undefined;
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

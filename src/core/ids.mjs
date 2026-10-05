/** Acepta IDs o URLs de Contentful, separados por coma, espacio o salto de línea. */
export function parseEntryIds(text) {
  const ids = text
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((t) => (t.includes('/entries/') ? t.split('/entries/')[1] : t))
    .map((t) => t.split(/[/?#]/)[0]);
  return [...new Set(ids)];
}

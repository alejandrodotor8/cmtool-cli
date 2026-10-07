/** Formato de un ID de Contentful: letras, números, punto, guion y guion bajo (hasta 64). */
const ENTRY_ID = /^[A-Za-z0-9._-]{1,64}$/;

export interface ParsedEntryIds {
  /** IDs válidos, sin repetidos y en el orden en que llegaron. */
  ids: string[];
  /** Lo que no es un entry ID ni la URL de una entry. */
  invalid: string[];
}

/**
 * Lee entry IDs o URLs de entries de Contentful (las de la barra del navegador, que
 * terminan en `/entries/<id>`). Acepta como separador coma, punto y coma, espacio,
 * tabulación y salto de línea: sirve pegar una columna o una fila de Excel.
 */
export function parseEntryIds(text: string): ParsedEntryIds {
  const ids: string[] = [];
  const invalid: string[] = [];
  const tokens = text
    .split(/[\s,;]+/)
    .map((t) => t.replace(/^["']+|["']+$/g, ''))
    .filter(Boolean);

  for (const token of tokens) {
    const id = token.includes('/entries/') ? (token.split('/entries/')[1]?.split(/[/?#]/)[0] ?? '') : token;
    if (ENTRY_ID.test(id)) ids.push(id);
    else invalid.push(token);
  }
  return { ids: [...new Set(ids)], invalid };
}

/**
 * Comparación de una entry entre dos ambientes, campo por campo. Funciones puras.
 */
import type { ContentType, Entry } from '../contentful/types.ts';
import { exactJson } from './json.ts';

export const VALUE = {
  SAME: 'same',
  DIFFERENT: 'different',
  ONLY_SRC: 'only-src', // tiene valor en origen y no en destino
  ONLY_DST: 'only-dst', // tiene valor en destino y no en origen
} as const;

export type ValueStatus = (typeof VALUE)[keyof typeof VALUE];

export interface FieldComparison {
  id: string;
  name: string;
  status: ValueStatus;
  src: unknown;
  dst: unknown;
}

/**
 * Compara los valores de cada campo, en el orden del modelo de origen; los campos que no
 * están en ese modelo van al final. Omite campos vacíos en ambos lados.
 * - `locales`: solo compara esos locales (por ejemplo, los de origen: los demás no se migran).
 * - `modelOnly`: solo los campos del modelo de origen (los que la migración puede escribir).
 */
export function compareEntryFields(
  src: Entry,
  dst: Entry,
  ct: ContentType | undefined,
  { locales, modelOnly = false }: { locales?: Set<string>; modelOnly?: boolean } = {},
): FieldComparison[] {
  const names = new Map((ct?.fields ?? []).map((f) => [f.id, f.name]));
  const ids = modelOnly
    ? [...names.keys()]
    : [...new Set([...names.keys(), ...Object.keys(src.fields ?? {}), ...Object.keys(dst.fields ?? {})])];
  const pick = (value: unknown) => (locales ? onlyLocales(value, locales) : value);

  return ids.flatMap((id) => {
    const a = pick(src.fields?.[id]);
    const b = pick(dst.fields?.[id]);
    if (a === undefined && b === undefined) return [];
    const status =
      b === undefined
        ? VALUE.ONLY_SRC
        : a === undefined
          ? VALUE.ONLY_DST
          : exactJson(a) === exactJson(b)
            ? VALUE.SAME
            : VALUE.DIFFERENT;
    return [{ id, name: names.get(id) ?? id, status, src: a, dst: b }];
  });
}

/** Resumen corto de un valor para mostrarlo en una tabla. */
export function summarizeValue(value: unknown, max = 40): string {
  const text = describe(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function describe(value: unknown): string {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'string') return value.replace(/\s+/g, ' ');
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.length}] ${value.slice(0, 3).map(describe).join(', ')}`;
  const obj = value as { sys?: { type?: string; id?: string }; nodeType?: string };
  if (obj.sys?.type === 'Link') return `→ ${obj.sys.id}`;
  if (obj.nodeType === 'document') return `rich text: ${richTextPlain(value)}`;
  const entries = Object.entries(value as Record<string, unknown>);
  // Valor por locale ({ "es-CO": … }): se muestra el primero.
  if (entries.length && entries.every(([k]) => /^[a-z]{2}(-[A-Za-z0-9]+)*$/.test(k))) {
    const [, first] = entries[0] as [string, unknown];
    return entries.length > 1 ? `${describe(first)} (+${entries.length - 1} idiomas)` : describe(first);
  }
  return exactJson(value);
}

function richTextPlain(node: unknown): string {
  const n = node as { value?: string; content?: unknown[] };
  return [n.value ?? '', ...(n.content ?? []).map(richTextPlain)].join(' ').replace(/\s+/g, ' ').trim();
}

/** El valor por locale solo con `locales`; `undefined` si no queda ninguno. */
function onlyLocales(value: unknown, locales: Set<string>): unknown {
  if (!value || typeof value !== 'object') return value;
  const kept = Object.entries(value as Record<string, unknown>).filter(([locale]) => locales.has(locale));
  return kept.length ? Object.fromEntries(kept) : undefined;
}

/** Los campos que una migración cambiaría en destino (modelo de origen, locales de origen). */
export const migrationChanges = (src: Entry, dst: Entry, ct: ContentType | undefined, srcLocales: Set<string>) =>
  compareEntryFields(src, dst, ct, { locales: srcLocales, modelOnly: true }).filter((f) => f.status !== VALUE.SAME);

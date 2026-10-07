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
 * Compara los valores (todos los locales) de cada campo, en el orden del modelo de origen;
 * los campos que no están en ese modelo van al final. Omite campos vacíos en ambos lados.
 */
export function compareEntryFields(src: Entry, dst: Entry, ct: ContentType | undefined): FieldComparison[] {
  const names = new Map((ct?.fields ?? []).map((f) => [f.id, f.name]));
  const ids = [...new Set([...names.keys(), ...Object.keys(src.fields ?? {}), ...Object.keys(dst.fields ?? {})])];

  return ids.flatMap((id) => {
    const a = src.fields?.[id];
    const b = dst.fields?.[id];
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

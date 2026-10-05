/**
 * Qué entries no se podrán publicar en destino después de migrar, por campos
 * obligatorios que quedan vacíos. Funciones puras: miran el plan, no Contentful.
 */
import type { Analysis } from '../analyze.ts';
import type { ContentType, Entry, Field } from '../contentful/types.ts';
import { contentTypeOf } from './entries.ts';
import { fieldsForDestination, mergeWithExisting } from './fields.ts';
import type { ContentTypeDiff } from './model.ts';
import { ACTION, type Plan } from './plan.ts';

/**
 * Campos que se escriben: los que existen en ambos modelos con el mismo tipo.
 * Los que solo existen en destino (o tienen otro tipo) no se tocan, así conservan su valor.
 */
export function writableFields(dstCT: ContentType, diff: ContentTypeDiff | undefined): Map<string, Field> {
  const skip = new Set([...(diff?.mismatched ?? []), ...(diff?.extra ?? [])].map((f) => f.id));
  return new Map(dstCT.fields.filter((f) => !skip.has(f.id)).map((f) => [f.id, f]));
}

/** Cómo quedará el content type en destino después de aplicar los cambios de modelo del plan. */
export function projectedContentType(ctId: string, analysis: Analysis, plan: Plan): ContentType | undefined {
  if (plan.contentTypesToCreate.some((ct) => ct.sys.id === ctId)) return analysis.contentTypes.src.get(ctId);
  const dstCT = analysis.contentTypes.dst.get(ctId);
  const added = plan.fieldsToAdd.get(ctId) ?? [];
  return dstCT && added.length ? { ...dstCT, fields: [...dstCT.fields, ...added] } : dstCT;
}

const isBlank = (value: unknown): boolean =>
  value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);

/**
 * Campos obligatorios que quedarán vacíos (en el locale por defecto de destino) en cada
 * entry que se escribe. Solo incluye entries con al menos un campo vacío.
 */
export function requiredGaps(analysis: Analysis, plan: Plan): Map<string, Field[]> {
  const { locales, diffs, dstEntries } = analysis;
  const gaps = new Map<string, Field[]>();

  for (const { id, action, entry } of plan.entries) {
    const ctId = contentTypeOf(entry);
    const ct = projectedContentType(ctId, analysis, plan);
    if (!ct) continue;

    const writable = writableFields(ct, diffs.get(ctId));
    const incoming = fieldsForDestination(entry, writable, locales.dst);
    const current: Entry['fields'] = dstEntries.get(id)?.fields ?? {};
    const result = action === ACTION.UPDATE ? mergeWithExisting(current, incoming, writable, locales.src) : incoming;

    const empty = ct.fields.filter(
      (f) => f.required && !f.disabled && !f.omitted && isBlank(result[f.id]?.[locales.dst.default ?? '']),
    );
    if (empty.length) gaps.set(id, empty);
  }
  return gaps;
}

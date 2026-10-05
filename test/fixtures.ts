/** Constructores mínimos de objetos de Contentful para los tests. */
import type { Analysis } from '../src/analyze.ts';
import type { Asset, Cma, ContentType, Entry, EntryTree, Field, Locales, Tag } from '../src/contentful/types.ts';
import { childEntryIds, contentTypeOf, makeTitleOf } from '../src/core/entries.ts';
import { diffContentType } from '../src/core/model.ts';
import { classifyTree, writtenEntries } from '../src/core/plan.ts';

export const link = (id: string, linkType: 'Entry' | 'Asset' = 'Entry') => ({ sys: { type: 'Link', linkType, id } });

export const entry = (
  id: string,
  contentType: string,
  fields: Record<string, Record<string, unknown>> = {},
  tags: string[] = [],
): Entry =>
  ({
    sys: { id, contentType: { sys: { id: contentType } } },
    fields,
    metadata: { tags: tags.map((t) => ({ sys: { type: 'Link', linkType: 'Tag', id: t } })) },
  }) as unknown as Entry;

export const field = (id: string, type = 'Symbol', extra: Partial<Field> = {}): Field => ({
  id,
  name: id,
  type,
  localized: false,
  required: false,
  ...extra,
});

export const contentType = (id: string, fields: Field[], displayField = 'title'): ContentType =>
  ({ sys: { id }, name: id, description: '', displayField, fields }) as unknown as ContentType;

export const asset = (
  id: string,
  file: Record<string, { url?: string; upload?: string }>,
  title?: Record<string, string>,
): Asset => {
  const files = Object.fromEntries(
    Object.entries(file).map(([locale, f]) => [locale, { fileName: `${id}.jpg`, contentType: 'image/jpeg', ...f }]),
  );
  return { sys: { id }, fields: { file: files, ...(title && { title }) } } as unknown as Asset;
};

export const tag = (id: string): Tag => ({ sys: { id, visibility: 'public' }, name: id }) as unknown as Tag;

export const locales = (codes: string[], def = codes[0]): Locales => ({ codes: new Set(codes), default: def });

/** Árbol a partir de las entries de origen; los hijos salen de sus links. */
export function treeOf(entries: Entry[], broken: string[] = []): EntryTree {
  return {
    entries: new Map(entries.map((e) => [e.sys.id, e])),
    children: new Map(entries.map((e) => [e.sys.id, childEntryIds(e)])),
    broken: new Set(broken),
  };
}

/** Análisis armado con las mismas funciones que usa la herramienta, sin red. */
export function analysisOf({
  rootIds,
  entries,
  existsInDst = [],
  dstEntries = [],
  srcCTs,
  dstCTs = [],
  srcAssets = [],
  existingAssets = [],
  missingTags = [],
}: {
  rootIds: string[];
  entries: Entry[];
  /** IDs que existen en destino (sin campos). */
  existsInDst?: string[];
  /** Entries que existen en destino, con sus campos. */
  dstEntries?: Entry[];
  srcCTs: ContentType[];
  dstCTs?: ContentType[];
  srcAssets?: Asset[];
  existingAssets?: string[];
  missingTags?: Tag[];
}): Analysis {
  const tree = treeOf(entries);
  const exists = new Set([...existsInDst, ...dstEntries.map((e) => e.sys.id)]);
  const actions = classifyTree(rootIds, tree, exists);
  const contentTypes = {
    src: new Map(srcCTs.map((ct) => [ct.sys.id, ct])),
    dst: new Map(dstCTs.map((ct) => [ct.sys.id, ct])),
  };
  const diffs = new Map(
    [...new Set(entries.map(contentTypeOf))].map((id) => [
      id,
      diffContentType(contentTypes.src.get(id) as ContentType, contentTypes.dst.get(id)),
    ]),
  );
  const ids = srcAssets.map((a) => a.sys.id);
  const loc = locales(['es-CO']);
  const analysis: Analysis = {
    src: 'develop',
    dst: 'qa',
    rootIds,
    tree,
    dstEntries: new Map(dstEntries.map((e) => [e.sys.id, e])),
    existsInDst: exists,
    actions,
    contentTypes,
    diffs,
    locales: { src: loc, dst: loc, missing: [] },
    assets: {
      ids,
      src: new Map(srcAssets.map((a) => [a.sys.id, a])),
      existing: new Set(existingAssets),
      missing: ids.filter((id) => !existingAssets.includes(id)),
    },
    tags: { dstIds: new Set(), missing: missingTags },
    titleOf: makeTitleOf(contentTypes.src, 'es-CO'),
  };
  return analysis;
}

/** IDs de las entries que se escriben, para comparar en los tests. */
export const writtenIds = (analysis: Analysis): string[] => writtenEntries(analysis).map((e) => e.sys.id);

export interface RecordedCall {
  method: string;
  params: Record<string, unknown>;
  data: unknown;
}

/**
 * CMA falso que registra cada llamada. `entries` alimenta `entry.getMany` / `entry.get`;
 * las escrituras devuelven lo que recibieron con un `sys` mínimo.
 */
export function fakeCma(entries: Entry[] = []): { cma: Cma; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const byId = new Map(entries.map((e) => [e.sys.id, e]));

  const handler = (entity: string, method: string) => async (params: Record<string, unknown>, data?: unknown) => {
    calls.push({ method: `${entity}.${method}`, params, data });
    if (entity === 'entry' && method === 'getMany') {
      const query = params.query as { 'sys.id[in]': string };
      const ids = query['sys.id[in]'].split(',');
      return { items: ids.flatMap((id) => byId.get(id) ?? []) };
    }
    if (method === 'get') return byId.get(params.entryId as string) ?? { sys: { id: 'x', version: 1 }, fields: {} };
    return { ...(data as object), sys: { id: 'x', version: 1 } };
  };

  const cma = new Proxy(
    {},
    { get: (_, entity: string) => new Proxy({}, { get: (__, method: string) => handler(entity, method) }) },
  ) as Cma;
  return { cma, calls };
}

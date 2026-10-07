/**
 * Paso de análisis: reúne todo lo necesario de origen y destino. Solo lectura.
 */
import {
  fetchAssets,
  fetchEntries,
  readContentTypes,
  readEntryTree,
  readLocales,
  readTags,
} from './contentful/read.ts';
import type { Asset, Cma, ContentType, Entry, EntryTree, Locales, Tag } from './contentful/types.ts';
import { assetIdsOf, contentTypeOf, isArchived, makeTitleOf } from './core/entries.ts';
import { type ContentTypeDiff, diffContentType } from './core/model.ts';
import { type Action, changedInDst, classifyTree, writtenEntries } from './core/plan.ts';

export interface Analysis {
  src: string;
  dst: string;
  rootIds: string[];
  tree: EntryTree;
  /** Las entries del árbol que ya existen en destino, tal como están allá. */
  dstEntries: Map<string, Entry>;
  existsInDst: Set<string>;
  /** Entries (del árbol o enlazadas en texto) que existen en destino pero están archivadas. */
  archivedInDst: Set<string>;
  /** Qué pasa con cada entry del árbol. */
  actions: Map<string, Action>;
  contentTypes: { src: Map<string, ContentType>; dst: Map<string, ContentType> };
  /** Comparación de modelo de cada content type del árbol. */
  diffs: Map<string, ContentTypeDiff>;
  locales: { src: Locales; dst: Locales; missing: string[] };
  /** Imágenes de las entries que se escriben. */
  assets: { ids: string[]; src: Map<string, Asset>; existing: Set<string>; missing: string[] };
  /** Tags de las entries que se escriben: los que ya hay en destino y los que faltan. */
  tags: { dstIds: Set<string>; missing: Tag[] };
  titleOf: (entry: Entry) => string;
}

/** Lee modelo e idiomas de un ambiente. */
export interface Loaders {
  contentTypes: (env: string) => Promise<Map<string, ContentType>>;
  locales: (env: string) => Promise<Locales>;
}

export async function analyze(
  cma: Cma,
  { src, dst, rootIds }: { src: string; dst: string; rootIds: string[] },
  /** Avisa en qué etapa va (para el spinner). */
  report: (stage: string) => void = () => {},
  /** Lectores de modelo e idiomas; por defecto leen de la API (el contexto los reutiliza). */
  load: Loaders = {
    contentTypes: (env) => readContentTypes(cma, env),
    locales: (env) => readLocales(cma, env),
  },
): Promise<Analysis> {
  // Árbol de entries y qué pasa con cada una.
  report(`Leyendo las entries y sus hijos en ${src}…`);
  const tree = await readEntryTree(cma, src, rootIds);
  // También se revisan en destino las entries enlazadas en texto, para avisar si no existen.
  const hyperlinked = [...new Set([...tree.hyperlinks.values()].flat())].filter((id) => !tree.entries.has(id));
  report(`Buscando qué ya existe en ${dst}…`);
  const dstEntries = await fetchEntries(cma, dst, [...tree.entries.keys(), ...hyperlinked]);
  const existsInDst = new Set(dstEntries.keys());
  const archivedInDst = new Set([...dstEntries.values()].filter(isArchived).map((e) => e.sys.id));
  const actions = classifyTree(rootIds, tree, existsInDst);
  const written = writtenEntries({ tree, actions });

  // Modelo: todos los content types del árbol, incluidos los de entries reutilizadas.
  report('Comparando modelos…');
  const contentTypes = { src: await load.contentTypes(src), dst: await load.contentTypes(dst) };
  const diffs = new Map<string, ContentTypeDiff>();
  for (const id of new Set([...tree.entries.values()].map(contentTypeOf))) {
    const srcCT = contentTypes.src.get(id);
    if (!srcCT) throw new Error(`El content type "${id}" no existe en ${src}.`);
    diffs.set(id, diffContentType(srcCT, contentTypes.dst.get(id)));
  }

  report('Revisando idiomas, imágenes y tags…');
  const srcLocales = await load.locales(src);
  const dstLocales = await load.locales(dst);
  const locales = {
    src: srcLocales,
    dst: dstLocales,
    missing: [...srcLocales.codes].filter((code) => !dstLocales.codes.has(code)),
  };

  // Imágenes: solo las de entries que se escriben.
  const assetIds = [...new Set(written.flatMap(assetIdsOf))];
  const srcAssets = await fetchAssets(cma, src, assetIds);
  const existingAssets = new Set((await fetchAssets(cma, dst, assetIds)).keys());
  const assets = {
    ids: assetIds,
    src: srcAssets,
    existing: existingAssets,
    missing: assetIds.filter((id) => !existingAssets.has(id) && srcAssets.has(id)),
  };

  // Tags: solo los de entries que se escriben.
  const tagIds = [...new Set(written.flatMap((e) => (e.metadata?.tags ?? []).map((t) => t.sys.id)))];
  const tags: Analysis['tags'] = { dstIds: new Set(), missing: [] };
  if (tagIds.length) {
    tags.dstIds = new Set((await readTags(cma, dst)).keys());
    const missingIds = tagIds.filter((id) => !tags.dstIds.has(id));
    const srcTags = missingIds.length ? await readTags(cma, src) : new Map<string, Tag>();
    tags.missing = missingIds.flatMap((id) => srcTags.get(id) ?? []);
  }

  return {
    src,
    dst,
    rootIds,
    tree,
    dstEntries,
    existsInDst,
    archivedInDst,
    actions,
    contentTypes,
    diffs,
    locales,
    assets,
    tags,
    titleOf: makeTitleOf(contentTypes.src, srcLocales.default),
  };
}

/**
 * Vuelve a mirar destino justo antes de escribir. Devuelve las entries del árbol que
 * aparecieron, desaparecieron o se archivaron mientras el usuario revisaba el plan.
 */
export async function changesSinceAnalysis(cma: Cma, analysis: Analysis): Promise<string[]> {
  const ids = [...analysis.tree.entries.keys()];
  const now = await fetchEntries(cma, analysis.dst, ids);
  return changedInDst(ids, analysis.dstEntries, now);
}

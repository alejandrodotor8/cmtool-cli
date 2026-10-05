/**
 * Paso 1: reúne todo lo necesario de origen y destino. Solo lectura.
 */
import { fetchByIds, readContentTypes, readEntryTree, readLocales, readTags } from './contentful/read.mjs';
import { assetIdsOf, contentTypeOf, makeTitleOf } from './core/entries.mjs';
import { diffContentType } from './core/model.mjs';
import { classifyTree, writtenEntries } from './core/plan.mjs';

export async function analyze(cma, { src, dst, rootIds }) {
  // Árbol de entries y qué pasa con cada una.
  const tree = await readEntryTree(cma, src, rootIds);
  const existsInDst = new Set((await fetchByIds(cma, dst, 'entry', tree.entries.keys())).keys());
  const actions = classifyTree(rootIds, tree, existsInDst);
  const written = writtenEntries({ tree, actions });

  // Modelo: todos los content types del árbol, incluidos los de entries reutilizadas.
  const contentTypes = { src: await readContentTypes(cma, src), dst: await readContentTypes(cma, dst) };
  const ctIds = [...new Set([...tree.entries.values()].map(contentTypeOf))];
  const diffs = new Map(ctIds.map((id) => [id, diffContentType(contentTypes.src.get(id), contentTypes.dst.get(id) ?? null)]));

  const locales = { src: await readLocales(cma, src), dst: await readLocales(cma, dst) };
  locales.missing = [...locales.src.codes].filter((code) => !locales.dst.codes.has(code));

  // Imágenes: solo las de entries que se escriben.
  const assetIds = [...new Set(written.flatMap(assetIdsOf))];
  const srcAssets = await fetchByIds(cma, src, 'asset', assetIds);
  const existingAssets = new Set((await fetchByIds(cma, dst, 'asset', assetIds)).keys());
  const assets = {
    ids: assetIds,
    src: srcAssets,
    existing: existingAssets,
    missing: assetIds.filter((id) => !existingAssets.has(id) && srcAssets.has(id)),
  };

  // Tags: solo los de entries que se escriben.
  const tagIds = [...new Set(written.flatMap((e) => (e.metadata?.tags ?? []).map((t) => t.sys.id)))];
  const tags = { dstIds: new Set(), missing: [] };
  if (tagIds.length) {
    tags.dstIds = new Set((await readTags(cma, dst)).keys());
    const missingIds = tagIds.filter((id) => !tags.dstIds.has(id));
    const srcTags = missingIds.length ? await readTags(cma, src) : new Map();
    tags.missing = missingIds.map((id) => srcTags.get(id)).filter(Boolean);
  }

  return {
    src,
    dst,
    rootIds,
    tree,
    existsInDst,
    actions,
    contentTypes,
    diffs,
    locales,
    assets,
    tags,
    titleOf: makeTitleOf(contentTypes.src, locales.src.default),
  };
}

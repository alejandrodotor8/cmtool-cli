/**
 * Lecturas del CMA. Nada de este módulo escribe en Contentful.
 */
import { AbortError } from '../errors.mjs';
import { childEntryIds } from '../core/entries.mjs';

const chunk = (arr, n) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/** Las entries pueden ser pesadas (rich text); lotes más chicos evitan respuestas demasiado grandes. */
const ENTRY_BATCH = 50;

export const listSpaces = async (cma) => (await cma.space.getMany({ query: { limit: 100 } })).items;

/** Ambientes utilizables del space, con los aliases que apuntan a cada uno. */
export async function listEnvironments(cma) {
  const envs = (await cma.environment.getMany({ query: { limit: 100 } })).items.filter(
    (e) => e.sys.status?.sys?.id !== 'failed',
  );
  let aliases = [];
  try {
    aliases = (await cma.environmentAlias.getMany({})).items;
  } catch {
    /* el space no usa aliases */
  }
  return envs.map((e) => ({
    id: e.sys.id,
    aliases: aliases.filter((a) => a.environment.sys.id === e.sys.id).map((a) => a.sys.id),
  }));
}

/** Trae por ID, en lotes, las entries o assets que existan. Los que no existen no vienen. */
export async function fetchByIds(cma, environmentId, kind, ids, batch = 100) {
  const found = new Map();
  for (const part of chunk([...ids], batch)) {
    const res = await cma[kind].getMany({
      environmentId,
      query: { 'sys.id[in]': part.join(','), limit: part.length },
    });
    res.items.forEach((item) => found.set(item.sys.id, item));
  }
  return found;
}

/**
 * Lee en origen las entries que pegaste y, nivel por nivel, todas las que cuelgan de ellas.
 * Devuelve las entries, los hijos de cada una y los links que apuntan a entries inexistentes.
 */
export async function readEntryTree(cma, environmentId, rootIds) {
  const entries = new Map();
  const children = new Map();
  const broken = new Set();

  let level = [...rootIds];
  while (level.length) {
    const found = await fetchByIds(cma, environmentId, 'entry', level, ENTRY_BATCH);
    const next = [];
    for (const id of level) {
      const entry = found.get(id);
      if (!entry) {
        if (rootIds.includes(id)) throw new AbortError(`La entry ${id} no existe en ${environmentId}.`);
        broken.add(id);
        continue;
      }
      entries.set(id, entry);
      children.set(id, childEntryIds(entry));
      next.push(...children.get(id));
    }
    level = [...new Set(next)].filter((id) => !entries.has(id) && !broken.has(id));
  }
  return { entries, children, broken };
}

/** Todos los content types del ambiente, por ID. */
export async function readContentTypes(cma, environmentId) {
  const all = new Map();
  for (let skip = 0; ; ) {
    const res = await cma.contentType.getMany({ environmentId, query: { limit: 1000, skip } });
    res.items.forEach((ct) => all.set(ct.sys.id, ct));
    skip += res.items.length;
    if (!res.items.length || skip >= res.total) break;
  }
  return all;
}

export async function readLocales(cma, environmentId) {
  const items = (await cma.locale.getMany({ environmentId, query: { limit: 100 } })).items;
  return { codes: new Set(items.map((l) => l.code)), default: items.find((l) => l.default)?.code };
}

export async function readTags(cma, environmentId) {
  const res = await cma.tag.getMany({ environmentId, query: { limit: 1000 } });
  return new Map(res.items.map((t) => [t.sys.id, t]));
}

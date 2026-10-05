/**
 * Reglas de la migración. Funciones puras: no leen ni escriben en Contentful.
 */
import { contentTypeOf } from './entries.mjs';

export const ACTION = Object.freeze({
  CREATE: 'create', // no existe en destino → se crea
  UPDATE: 'update', // la pegaste y ya existe en destino → se actualiza
  REUSE: 'reuse', // hijo que ya existe en destino → no se toca
  ORPHAN: 'orphan', // no existe, pero cuelga de un hijo reutilizado → no se crea
});

export const isWrite = (action) => action === ACTION.CREATE || action === ACTION.UPDATE;

/**
 * Decide qué pasa con cada entry del árbol:
 *  - lo que pegas se crea o se actualiza;
 *  - un hijo que no existe en destino, colgando de algo que se escribe, se crea;
 *  - un hijo que ya existe en destino se reutiliza sin tocarlo;
 *  - lo que cuelga de un hijo reutilizado y no existe en destino no se crea,
 *    porque la versión de destino no apunta a ello.
 */
export function classifyTree(rootIds, tree, existsInDst) {
  const written = new Set();
  const queue = [...rootIds];
  while (queue.length) {
    const id = queue.shift();
    if (written.has(id) || !tree.entries.has(id)) continue;
    written.add(id);
    queue.push(...tree.children.get(id).filter((child) => !existsInDst.has(child)));
  }

  const actions = new Map();
  for (const id of tree.entries.keys()) {
    const exists = existsInDst.has(id);
    if (written.has(id)) actions.set(id, exists ? ACTION.UPDATE : ACTION.CREATE);
    else actions.set(id, exists ? ACTION.REUSE : ACTION.ORPHAN);
  }
  return actions;
}

export const writtenEntries = ({ tree, actions }) =>
  [...tree.entries.values()].filter((e) => isWrite(actions.get(e.sys.id)));

export const writtenContentTypes = (analysis) => new Set(writtenEntries(analysis).map(contentTypeOf));

/**
 * Lo que se puede agregar al modelo de destino, agrupado por content type.
 * Un content type que no existe solo se ofrece si alguna entry que se escribe lo usa.
 * Un campo que falta se ofrece siempre, avisando si solo lo usan entries reutilizadas.
 */
export function modelOptions(analysis) {
  const written = writtenContentTypes(analysis);
  return [...analysis.diffs.values()]
    .filter((d) => (d.missingCT ? written.has(d.id) : d.missing.length > 0))
    .map((diff) => ({ diff, onlyReused: !written.has(diff.id) }));
}

/**
 * Plan de escritura a partir del análisis y lo que eligió el usuario.
 * `picked` son las opciones de modelo marcadas: `{ ctId }` crea el content type,
 * `{ ctId, field }` agrega ese campo.
 */
export function buildPlan(analysis, { withAssets, picked }) {
  const { diffs, assets, tags, contentTypes, actions } = analysis;

  const createCTs = new Set(picked.filter((p) => !p.field).map((p) => p.ctId));
  const fieldsToAdd = new Map();
  for (const { ctId, field } of picked.filter((p) => p.field)) {
    fieldsToAdd.set(ctId, [...(fieldsToAdd.get(ctId) ?? []), field]);
  }

  // Sin content type en destino, esas entries no se pueden crear.
  const skippedCTs = new Set([...diffs.values()].filter((d) => d.missingCT && !createCTs.has(d.id)).map((d) => d.id));
  const writes = writtenEntries(analysis).map((entry) => ({ id: entry.sys.id, action: actions.get(entry.sys.id), entry }));

  return {
    withAssets,
    tagsToCreate: tags.missing,
    contentTypesToCreate: [...createCTs].map((id) => contentTypes.src.get(id)),
    fieldsToAdd,
    assetsToCreate: withAssets ? assets.missing.map((id) => assets.src.get(id)) : [],
    entries: writes.filter((w) => !skippedCTs.has(contentTypeOf(w.entry))),
    skipped: writes.filter((w) => skippedCTs.has(contentTypeOf(w.entry))).map((w) => w.id),
    notAdded: [...diffs.values()].flatMap((d) =>
      d.missingCT
        ? []
        : d.missing.filter((f) => !fieldsToAdd.get(d.id)?.some((a) => a.id === f.id)).map((f) => `${d.id}.${f.id}`),
    ),
  };
}

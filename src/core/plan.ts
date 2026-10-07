/**
 * Reglas de la migración. Funciones puras: no leen ni escriben en Contentful.
 */
import type { Analysis } from '../analyze.ts';
import type { Asset, Entry, EntryTree, Tag } from '../contentful/types.ts';
import { contentTypeOf, isArchived as isArchivedEntry } from './entries.ts';
import { type ModelChanges, type ModelPick, modelChangesFrom, notAddedFields } from './model-changes.ts';

export const ACTION = {
  CREATE: 'create', // no existe en destino → se crea
  UPDATE: 'update', // la pegaste y ya existe en destino → se actualiza
  REUSE: 'reuse', // hijo que ya existe en destino → no se toca
  ORPHAN: 'orphan', // no existe, pero cuelga de un hijo reutilizado → no se crea
} as const;

export type Action = (typeof ACTION)[keyof typeof ACTION];

export const isWrite = (action: Action | undefined): boolean => action === ACTION.CREATE || action === ACTION.UPDATE;

export interface PlannedEntry {
  id: string;
  action: Action;
  entry: Entry;
}

export interface Plan extends ModelChanges {
  withAssets: boolean;
  tagsToCreate: Tag[];
  assetsToCreate: Asset[];
  entries: PlannedEntry[];
  /** Entries que no se escriben porque su content type no existe en destino. */
  skipped: string[];
  /** Entries que pegaste y están archivadas en destino: no se pueden actualizar. */
  archived: string[];
  /** Campos que faltan en destino y no se marcaron (`contentType.campo`). */
  notAdded: string[];
}

/**
 * Decide qué pasa con cada entry del árbol:
 *  - lo que pegas se crea o se actualiza;
 *  - un hijo que no existe en destino, colgando de algo que se escribe, se crea;
 *  - un hijo que ya existe en destino se reutiliza sin tocarlo;
 *  - lo que cuelga de un hijo reutilizado y no existe en destino no se crea,
 *    porque la versión de destino no apunta a ello.
 */
export function classifyTree(rootIds: string[], tree: EntryTree, existsInDst: Set<string>): Map<string, Action> {
  const written = new Set<string>();
  const queue = [...rootIds];
  while (queue.length) {
    const id = queue.shift() as string;
    if (written.has(id) || !tree.entries.has(id)) continue;
    written.add(id);
    queue.push(...(tree.children.get(id) ?? []).filter((child) => !existsInDst.has(child)));
  }

  const actions = new Map<string, Action>();
  for (const id of tree.entries.keys()) {
    const exists = existsInDst.has(id);
    if (written.has(id)) actions.set(id, exists ? ACTION.UPDATE : ACTION.CREATE);
    else actions.set(id, exists ? ACTION.REUSE : ACTION.ORPHAN);
  }
  return actions;
}

export const writtenEntries = ({ tree, actions }: Pick<Analysis, 'tree' | 'actions'>): Entry[] =>
  [...tree.entries.values()].filter((e) => isWrite(actions.get(e.sys.id)));

export const writtenContentTypes = (analysis: Pick<Analysis, 'tree' | 'actions'>): Set<string> =>
  new Set(writtenEntries(analysis).map(contentTypeOf));

/** Plan de escritura a partir del análisis y lo que eligió el usuario. */
export function buildPlan(
  analysis: Analysis,
  { withAssets, picked }: { withAssets: boolean; picked: ModelPick[] },
): Plan {
  const { diffs, assets, tags, contentTypes, actions } = analysis;
  const changes = modelChangesFrom(picked, contentTypes.src);
  const createCTs = new Set(changes.contentTypesToCreate.map((ct) => ct.sys.id));

  // Sin content type en destino, esas entries no se pueden crear.
  const skippedCTs = new Set([...diffs.values()].filter((d) => d.missingCT && !createCTs.has(d.id)).map((d) => d.id));
  const writes: PlannedEntry[] = writtenEntries(analysis).map((entry) => ({
    id: entry.sys.id,
    action: actions.get(entry.sys.id) as Action,
    entry,
  }));
  const isSkipped = (w: PlannedEntry) => skippedCTs.has(contentTypeOf(w.entry));
  const isArchived = (w: PlannedEntry) => w.action === ACTION.UPDATE && analysis.archivedInDst.has(w.id);

  return {
    ...changes,
    withAssets,
    tagsToCreate: tags.missing,
    assetsToCreate: withAssets ? assets.missing.flatMap((id) => assets.src.get(id) ?? []) : [],
    entries: writes.filter((w) => !isSkipped(w) && !isArchived(w)),
    skipped: writes.filter(isSkipped).map((w) => w.id),
    archived: writes.filter(isArchived).map((w) => w.id),
    notAdded: notAddedFields(diffs.values(), changes.fieldsToAdd),
  };
}

/** La entry va a existir en destino después de migrar (ya existe o se escribe). */
export const willExistInDst = ({ existsInDst, actions }: Pick<Analysis, 'existsInDst' | 'actions'>, id: string) =>
  existsInDst.has(id) || isWrite(actions.get(id));

/**
 * Textos enlazados (rich text) de las entries que se escriben que apuntan a entries que
 * no van a existir en destino. Por entry: los IDs a los que apunta.
 */
export function brokenHyperlinks(analysis: Pick<Analysis, 'tree' | 'actions' | 'existsInDst'>): Map<string, string[]> {
  const broken = new Map<string, string[]>();
  for (const entry of writtenEntries(analysis)) {
    const missing = (analysis.tree.hyperlinks.get(entry.sys.id) ?? []).filter((id) => !willExistInDst(analysis, id));
    if (missing.length) broken.set(entry.sys.id, missing);
  }
  return broken;
}

/**
 * Entries del árbol cuyo estado en destino cambió entre dos lecturas: aparecieron,
 * desaparecieron o se archivaron/desarchivaron.
 */
export function changedInDst(ids: Iterable<string>, before: Map<string, Entry>, after: Map<string, Entry>): string[] {
  return [...ids].filter((id) => {
    const a = before.get(id);
    const b = after.get(id);
    return Boolean(a) !== Boolean(b) || (a && b && isArchivedEntry(a) !== isArchivedEntry(b));
  });
}

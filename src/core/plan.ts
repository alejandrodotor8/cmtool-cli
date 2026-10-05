/**
 * Reglas de la migración. Funciones puras: no leen ni escriben en Contentful.
 */
import type { Analysis } from '../analyze.ts';
import type { Asset, ContentType, Entry, EntryTree, Field, Tag } from '../contentful/types.ts';
import { contentTypeOf, isArchived as isArchivedEntry } from './entries.ts';
import type { ContentTypeDiff } from './model.ts';

export const ACTION = {
  CREATE: 'create', // no existe en destino → se crea
  UPDATE: 'update', // la pegaste y ya existe en destino → se actualiza
  REUSE: 'reuse', // hijo que ya existe en destino → no se toca
  ORPHAN: 'orphan', // no existe, pero cuelga de un hijo reutilizado → no se crea
} as const;

export type Action = (typeof ACTION)[keyof typeof ACTION];

export const isWrite = (action: Action | undefined): boolean => action === ACTION.CREATE || action === ACTION.UPDATE;

/** Una opción del modelo marcada por el usuario: sin `field` crea el content type completo. */
export interface ModelPick {
  ctId: string;
  field?: Field;
}

export interface ModelOption {
  diff: ContentTypeDiff;
  /** Solo lo usan entries reutilizadas: se agrega al modelo, pero su contenido no se copia. */
  onlyReused: boolean;
}

export interface PlannedEntry {
  id: string;
  action: Action;
  entry: Entry;
}

export interface Plan {
  withAssets: boolean;
  tagsToCreate: Tag[];
  contentTypesToCreate: ContentType[];
  fieldsToAdd: Map<string, Field[]>;
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

const writtenContentTypes = (analysis: Pick<Analysis, 'tree' | 'actions'>): Set<string> =>
  new Set(writtenEntries(analysis).map(contentTypeOf));

/**
 * Lo que se puede agregar al modelo de destino, agrupado por content type.
 * Un content type que no existe solo se ofrece si alguna entry que se escribe lo usa.
 * Un campo que falta se ofrece siempre, avisando si solo lo usan entries reutilizadas.
 */
export function modelOptions(analysis: Analysis): ModelOption[] {
  const written = writtenContentTypes(analysis);
  return [...analysis.diffs.values()]
    .filter((d) => (d.missingCT ? written.has(d.id) : d.missing.length > 0))
    .map((diff) => ({ diff, onlyReused: !written.has(diff.id) }));
}

/** Plan de escritura a partir del análisis y lo que eligió el usuario. */
export function buildPlan(
  analysis: Analysis,
  { withAssets, picked }: { withAssets: boolean; picked: ModelPick[] },
): Plan {
  const { diffs, assets, tags, contentTypes, actions } = analysis;

  const createCTs = new Set(picked.filter((p) => !p.field).map((p) => p.ctId));
  const fieldsToAdd = new Map<string, Field[]>();
  for (const { ctId, field } of picked) {
    if (field) fieldsToAdd.set(ctId, [...(fieldsToAdd.get(ctId) ?? []), field]);
  }

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
    withAssets,
    tagsToCreate: tags.missing,
    contentTypesToCreate: [...createCTs].flatMap((id) => contentTypes.src.get(id) ?? []),
    fieldsToAdd,
    assetsToCreate: withAssets ? assets.missing.flatMap((id) => assets.src.get(id) ?? []) : [],
    entries: writes.filter((w) => !isSkipped(w) && !isArchived(w)),
    skipped: writes.filter(isSkipped).map((w) => w.id),
    archived: writes.filter(isArchived).map((w) => w.id),
    notAdded: [...diffs.values()].flatMap((d) =>
      d.missingCT
        ? []
        : d.missing.filter((f) => !fieldsToAdd.get(d.id)?.some((a) => a.id === f.id)).map((f) => `${d.id}.${f.id}`),
    ),
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

import pc from 'picocolors';
import type { Analysis } from '../../analyze.ts';
import { contentTypeOf } from '../../core/entries.ts';
import type { FieldComparison } from '../../core/entry-compare.ts';
import { ACTION, type Action, willExistInDst } from '../../core/plan.ts';
import { log } from '../log.ts';
import { clip, legend, MARK, table } from '../table.ts';
import { changedFieldsText } from '../text.ts';
import { envColumns } from './shared.ts';

/** Lo que necesita el árbol (sirve antes y después de decidir qué actualizar). */
export type TreeView = Pick<
  Analysis,
  'src' | 'dst' | 'rootIds' | 'tree' | 'existsInDst' | 'archivedInDst' | 'actions' | 'titleOf' | 'changes'
>;

export const countActions = (actions: Map<string, Action>, action: Action): number =>
  [...actions.values()].filter((a) => a === action).length;

/** Qué se hará con una entry del árbol: si está archivada en destino y qué campos cambian. */
function actionLabel(
  action: Action | undefined,
  { archived, fields, src, dst }: { archived: boolean; fields: FieldComparison[]; src: string; dst: string },
): string {
  if (!action) return pc.dim('ya listada arriba');
  if (archived && (action === ACTION.UPDATE || action === ACTION.KEEP))
    return pc.red(`archivada en ${dst} → no se toca`);
  if (archived && action === ACTION.REUSE) return pc.yellow(`archivada en ${dst} → el padre no se podrá publicar`);
  switch (action) {
    case ACTION.CREATE:
      return pc.green('se crea');
    case ACTION.UPDATE:
      return pc.yellow(`se actualiza · ${changedFieldsText(fields)}`);
    case ACTION.KEEP:
      return fields.length
        ? pc.dim(`ya existe · no se actualiza (${fields.length} cambio(s))`)
        : pc.dim('ya existe · sin cambios');
    case ACTION.REUSE:
      return fields.length
        ? pc.yellow(`ya existe · cambió en ${src} (${fields.length} campo(s)), no se migra`)
        : pc.cyan('ya existe → se reutiliza');
    case ACTION.ORPHAN:
      return pc.dim('no se crea (cuelga de algo que no se escribe)');
  }
}

/** Árbol padre → hijos, con lo que se hará con cada entry. */
export function renderEntryTree(analysis: TreeView, title = 'Entries'): void {
  const { src, dst, rootIds, tree, existsInDst, archivedInDst, actions, titleOf, changes } = analysis;
  log.step(title);
  const rows: string[][] = [];
  const listed = new Set<string>();

  /** Un texto enlazado en un rich text: no es hijo, no se migra; solo se avisa si no existirá en destino. */
  const hyperlinkRow = (id: string, lead: string) => {
    const target = tree.entries.get(id);
    const name = target ? clip(titleOf(target), 30) : pc.dim('enlace en texto');
    rows.push([
      `${lead}${pc.dim('↗ ')}${name}`,
      target ? pc.dim(contentTypeOf(target)) : '',
      pc.dim(id),
      '',
      existsInDst.has(id) ? MARK.yes : MARK.no,
      willExistInDst(analysis, id)
        ? pc.dim('enlace en texto · no se migra')
        : pc.yellow(`enlace en texto · no existe en ${dst}`),
    ]);
  };

  const walk = (id: string, prefix: string, isLast: boolean, isRoot: boolean): void => {
    const lead = pc.dim(prefix + (isRoot ? '' : isLast ? '└─ ' : '├─ '));
    const entry = tree.entries.get(id);
    if (!entry) {
      rows.push([lead + pc.red('(no existe)'), '', pc.dim(id), MARK.no, '', pc.red(`link roto en ${src}, se ignora`)]);
      return;
    }
    const name = clip(titleOf(entry), 40 - prefix.length);
    const repeated = listed.has(id);
    rows.push([
      lead + (isRoot ? pc.bold(name) : name),
      pc.dim(contentTypeOf(entry)),
      pc.dim(id),
      MARK.yes,
      existsInDst.has(id) ? MARK.yes : MARK.no,
      actionLabel(repeated ? undefined : actions.get(id), {
        archived: archivedInDst.has(id),
        fields: changes.get(id) ?? [],
        src,
        dst,
      }),
    ]);
    if (repeated) return;
    listed.add(id);
    const kids = tree.children.get(id) ?? [];
    const links = tree.hyperlinks.get(id) ?? [];
    const childPrefix = isRoot ? '' : prefix + (isLast ? '   ' : '│  ');
    kids.forEach((kid, i) => {
      walk(kid, childPrefix, i === kids.length - 1 && !links.length, false);
    });
    links.forEach((link, i) => {
      hyperlinkRow(link, pc.dim(childPrefix + (i === links.length - 1 ? '└─ ' : '├─ ')));
    });
  };
  for (const id of rootIds) walk(id, '', true, true);

  const n = (action: Action) => countActions(actions, action);
  const counts = [
    `${n(ACTION.CREATE)} se crean`,
    n(ACTION.UPDATE) && `${n(ACTION.UPDATE)} se actualizan`,
    n(ACTION.KEEP) && `${n(ACTION.KEEP)} no se actualizan`,
    n(ACTION.REUSE) && `${n(ACTION.REUSE)} se reutilizan`,
    n(ACTION.ORPHAN) && `${n(ACTION.ORPHAN)} no se crean`,
  ].filter(Boolean);

  legend();
  table({
    title: `${pc.bold(`${rootIds.length} padre(s) · ${tree.entries.size - rootIds.length} hijo(s)`)}  ${pc.dim(counts.join(', '))}`,
    columns: [
      { header: 'Entry' },
      { header: 'Content type' },
      { header: 'ID' },
      ...envColumns(src, dst),
      { header: 'Acción' },
    ],
    rows,
  });
}

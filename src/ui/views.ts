/**
 * Lo que se muestra en la terminal. Solo pinta: no pregunta ni decide nada.
 */
import pc from 'picocolors';
import type { Analysis } from '../analyze.ts';
import type { BackupData, SavedEntry } from '../backup.ts';
import type { Entry, Field } from '../contentful/types.ts';
import { contentTypeOf } from '../core/entries.ts';
import { FIELD, type FieldRow, fieldType, type RuleChanges } from '../core/model.ts';
import { ACTION, type Action, isWrite, type Plan, willExistInDst } from '../core/plan.ts';
import { RESTORE, type RestoreStatus, restoreStatus } from '../core/restore.ts';
import { log } from './log.ts';
import { type Column, clip, legend, MARK, table } from './table.ts';

const ACTION_LABEL: Record<Action, string> = {
  [ACTION.CREATE]: pc.green('se crea'),
  [ACTION.UPDATE]: pc.yellow('se actualiza'),
  [ACTION.REUSE]: pc.cyan('ya existe → se reutiliza'),
  [ACTION.ORPHAN]: pc.dim('no se crea (cuelga de una reutilizada)'),
};

const envColumns = (src: string, dst: string): Column[] => [
  { header: src, align: 'center' },
  { header: dst, align: 'center' },
];

const countActions = (actions: Map<string, Action>, action: Action): number =>
  [...actions.values()].filter((a) => a === action).length;

const formatBytes = (n: number | undefined): string =>
  n == null
    ? ''
    : n < 1024
      ? `${n} B`
      : n < 1024 ** 2
        ? `${Math.round(n / 1024)} KB`
        : `${(n / 1024 ** 2).toFixed(1)} MB`;

/** Qué se hará con una entry del árbol, teniendo en cuenta si está archivada en destino. */
function actionLabel(action: Action | undefined, archived: boolean, dst: string): string {
  if (!action) return pc.dim('ya listada arriba');
  if (archived && action === ACTION.UPDATE) return pc.red(`archivada en ${dst} → no se toca`);
  if (archived && action === ACTION.REUSE) return pc.yellow(`archivada en ${dst} → el padre no se podrá publicar`);
  return ACTION_LABEL[action];
}

/** Árbol padre → hijos, con lo que se hará con cada entry. */
export function renderEntryTree(analysis: Analysis): void {
  const { src, dst, rootIds, tree, existsInDst, archivedInDst, actions, titleOf } = analysis;
  log.step('Entries');
  const rows: string[][] = [];
  const listed = new Set<string>();

  /** Un texto enlazado en un rich text: no es hijo, no se migra; solo se avisa si no existirá en destino. */
  const hyperlinkRow = (id: string, lead: string) => {
    const target = tree.entries.get(id);
    const name = target ? clip(titleOf(target), 30) : pc.dim('enlace en texto');
    const ok = willExistInDst(analysis, id);
    rows.push([
      `${lead}${pc.dim('↗ ')}${name}`,
      target ? pc.dim(contentTypeOf(target)) : '',
      pc.dim(id),
      '',
      existsInDst.has(id) ? MARK.yes : MARK.no,
      ok ? pc.dim('enlace en texto · no se migra') : pc.yellow(`enlace en texto · no existe en ${dst}`),
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
    const action = actions.get(id);
    rows.push([
      lead + (isRoot ? pc.bold(name) : name),
      pc.dim(contentTypeOf(entry)),
      pc.dim(id),
      MARK.yes,
      existsInDst.has(id) ? MARK.yes : MARK.no,
      actionLabel(repeated ? undefined : action, archivedInDst.has(id), dst),
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

/** Imágenes y archivos que usan las entries que se escriben. */
export function renderAssets({ src, dst, assets, locales }: Analysis): void {
  log.step('Imágenes y media');
  const locale = locales.src.default;

  const rows = assets.ids.map((id) => {
    const asset = assets.src.get(id);
    const inDst = assets.existing.has(id);
    const dstMark = inDst ? MARK.yes : MARK.no;
    if (!asset) {
      return [
        pc.red('(no existe)'),
        pc.dim(id),
        '',
        MARK.no,
        dstMark,
        inDst ? pc.dim('se reutiliza') : pc.red(`link roto en ${src}`),
      ];
    }
    const files = asset.fields.file ?? {};
    const file = (locale ? files[locale] : undefined) ?? Object.values(files)[0];
    const name = (locale ? asset.fields.title?.[locale] : undefined) ?? file?.fileName ?? '(sin nombre)';
    const img = file?.details?.image as { width: number; height: number } | undefined;
    const detail = [file?.contentType, img && `${img.width}×${img.height}`, formatBytes(file?.details?.size)]
      .filter(Boolean)
      .join(' · ');
    const status = inDst ? pc.green('ya existe → se reutiliza') : pc.yellow(`falta en ${dst}`);
    return [clip(name), pc.dim(id), pc.dim(detail), MARK.yes, dstMark, status];
  });

  table({
    title: `${pc.bold(`${assets.ids.length} archivo(s)`)}  ${pc.dim(`${assets.existing.size} ya existen, ${assets.missing.length} faltan en ${dst}`)}`,
    columns: [
      { header: 'Imagen' },
      { header: 'ID' },
      { header: 'Detalle' },
      ...envColumns(src, dst),
      { header: 'Estado' },
    ],
    rows,
  });
}

/** Nombres legibles de las validaciones de Contentful. */
const VALIDATION_LABEL: Record<string, string> = {
  linkContentType: 'tipos de entry permitidos',
  linkMimetypeGroup: 'tipo de archivo',
  size: 'tamaño',
  range: 'rango',
  in: 'valores permitidos',
  regexp: 'formato',
  prohibitRegexp: 'formato prohibido',
  unique: 'único',
  dateRange: 'rango de fechas',
  assetFileSize: 'peso del archivo',
  assetImageDimensions: 'dimensiones de imagen',
  enabledNodeTypes: 'bloques de rich text',
  enabledMarks: 'formatos de rich text',
  nodes: 'links en rich text',
};

const validationLabel = (name: string) => {
  const base = name.replace(/^items\./, '');
  return VALIDATION_LABEL[base] ?? base;
};

/** Texto de las reglas que cambian en destino. */
function rulesText(rules: RuleChanges, dst: string, dstDefault: string | undefined): string {
  return [
    rules.requiredOnlyInDst && `obligatorio en ${dst}`,
    rules.localizationLost && `no localizado en ${dst}: solo se copia ${dstDefault ?? 'el locale por defecto'}`,
    rules.validations.length && `validaciones: ${[...new Set(rules.validations.map(validationLabel))].join(', ')}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

function fieldRow(
  { field, dstField, status, rules }: FieldRow,
  index: number,
  dst: string,
  dstDefault: string | undefined,
): string[] {
  const cells = [clip(field.name, 28), pc.dim(field.id), fieldType(field)];
  const num = pc.dim(String(index + 1));
  switch (status) {
    case FIELD.OK:
      return [num, ...cells, MARK.yes, MARK.yes, pc.green('al día')];
    case FIELD.RULES:
      return [
        num,
        ...cells,
        MARK.yes,
        MARK.rules,
        pc.yellow(rules ? rulesText(rules, dst, dstDefault) : 'reglas distintas'),
      ];
    case FIELD.MISSING:
      return [num, ...cells, MARK.yes, MARK.no, pc.yellow(`falta en ${dst}`)];
    case FIELD.MISMATCH:
      return [
        num,
        ...cells,
        MARK.yes,
        MARK.diff,
        pc.red(`en ${dst} es ${dstField ? fieldType(dstField) : '?'} → no se migra`),
      ];
    case FIELD.EXTRA:
      return [pc.dim('·'), ...cells, MARK.no, MARK.yes, pc.cyan(`sobra en ${dst} → se conserva`)];
  }
}

/** Una tabla por content type del árbol, campo por campo, en el orden del modelo de origen. */
export function renderModel({ src, dst, diffs, tree, actions, titleOf, locales }: Analysis): void {
  log.step(`Modelo  ${pc.bold(src)} ${pc.dim('vs')} ${pc.bold(dst)}`);
  legend();

  for (const diff of diffs.values()) {
    const badges = diff.missingCT
      ? [pc.red(`no existe en ${dst}`)]
      : [
          diff.missing.length && pc.yellow(`${diff.missing.length} falta(n)`),
          diff.extra.length && pc.cyan(`${diff.extra.length} sobra(n)`),
          diff.mismatched.length && pc.red(`${diff.mismatched.length} otro tipo`),
          diff.changedRules.length && pc.yellow(`${diff.changedRules.length} con reglas distintas`),
        ].filter(Boolean);
    const usedBy = [...tree.entries.values()]
      .filter((e) => contentTypeOf(e) === diff.id)
      .map((e) => titleOf(e) + (isWrite(actions.get(e.sys.id)) ? '' : ' (reutilizada)'));

    console.log();
    table({
      title: `${pc.bold(diff.name)} ${pc.dim(diff.id)}  ${badges.length ? badges.join(pc.dim(' · ')) : pc.green('al día')}`,
      columns: [
        { header: '#' },
        { header: 'Campo' },
        { header: 'ID' },
        { header: 'Tipo' },
        ...envColumns(src, dst),
        { header: 'Estado' },
      ],
      rows: diff.rows.map((row, i) => fieldRow(row, i, dst, locales.dst.default)),
    });
    log.info(`usado por: ${clip(usedBy.join(', '), 90)}`);
  }
}

/** Caja final con todo lo que va a pasar, antes de confirmar. */
export function renderSummary(
  { src, dst, actions, assets, locales, tree, titleOf }: Analysis,
  plan: Plan,
  { gaps, hyperlinks }: { gaps: Map<string, Field[]>; hyperlinks: Map<string, string[]> },
): void {
  log.step('Resumen');
  const created = plan.entries.filter((e) => e.action === ACTION.CREATE).length;
  const reused = countActions(actions, ACTION.REUSE);
  const newFields = [...plan.fieldsToAdd.values()].reduce((n, fields) => n + fields.length, 0);
  const modelChanges = plan.contentTypesToCreate.length + newFields;

  const rows: [string, string][] = [
    ['Entries', `${pc.green(`${created} se crean`)} · ${pc.yellow(`${plan.entries.length - created} se actualizan`)}`],
  ];
  if (reused) rows.push(['', pc.cyan(`${reused} hijo(s) ya existen en ${dst} → se reutilizan sin tocarlos`)]);
  if (plan.skipped.length)
    rows.push(['', pc.red(`${plan.skipped.length} no se migran (content type no existe en ${dst})`)]);
  if (plan.archived.length) rows.push(['', pc.red(`${plan.archived.length} no se tocan (archivadas en ${dst})`)]);
  rows.push([
    'Modelo',
    modelChanges
      ? pc.yellow(`+${plan.contentTypesToCreate.length} content type(s) · +${newFields} campo(s)`) +
        pc.dim(' (se publica el modelo)')
      : pc.dim('sin cambios'),
  ]);
  if (plan.notAdded.length) rows.push(['', pc.dim(`no se migran: ${clip(plan.notAdded.join(', '), 70)}`)]);
  if (assets.ids.length) {
    rows.push([
      'Imágenes',
      plan.withAssets
        ? `${pc.green(`${assets.missing.length} se crean`)} · ${assets.existing.size} se reutilizan`
        : `${assets.existing.size} se reutilizan${assets.missing.length ? pc.red(` · ${assets.missing.length} no se crean`) : ''}`,
    ]);
  }
  if (plan.tagsToCreate.length) rows.push(['Tags', pc.green(`${plan.tagsToCreate.length} se crean`)]);
  if (locales.missing.length) rows.push(['Locales', pc.dim(`se omiten: ${locales.missing.join(', ')}`)]);

  table({
    title: `${pc.bold(src)} ${pc.dim('──▶')} ${pc.bold(dst)}  ${pc.dim('entries e imágenes quedan en draft')}`,
    columns: [{}, {}],
    rows: rows.map(([label, value]) => [pc.bold(label), value]),
  });
  if (plan.skipped.length) log.warn(`Quien use estas entries quedará con links rotos: ${plan.skipped.join(', ')}`);

  if (hyperlinks.size) {
    log.warn(`Hay textos enlazados a entries que no existen en ${dst}: esos enlaces quedarán rotos.`);
    for (const [id, targets] of hyperlinks) {
      const entry = tree.entries.get(id);
      log.info(`${clip(entry ? titleOf(entry) : id)} ${id}: ${targets.join(', ')}`);
    }
  }

  if (gaps.size) {
    log.warn(
      `${gaps.size} entry(s) quedarán en ${dst} con campos obligatorios vacíos: no se podrán publicar hasta completarlos.`,
    );
    for (const [id, fields] of gaps) {
      const entry = tree.entries.get(id);
      const name = entry ? titleOf(entry) : id;
      log.info(`${clip(name)} ${id}: ${fields.map((f) => f.name).join(', ')}`);
    }
  }
}

const RESTORE_LABEL: Record<RestoreStatus, string> = {
  [RESTORE.RESTORE]: pc.green('se restaura'),
  [RESTORE.CHANGED]: pc.yellow('se editó después → ese cambio también se deshace'),
  [RESTORE.MISSING]: pc.red('ya no existe → se omite'),
};

/** Qué va a restaurar un respaldo, y lo que la migración creó (que no se borra). */
export function renderRestore(data: BackupData, items: { saved: SavedEntry; current: Entry | undefined }[]): void {
  log.step('Restaurar');
  const date = new Date(data.createdAt).toLocaleString('es-CO');
  table({
    title: `${pc.bold(data.src)} ${pc.dim('──▶')} ${pc.bold(data.dst)}  ${pc.dim(`${data.kind === 'restore' ? 'restore' : 'migración'} del ${date}`)}`,
    columns: [
      { header: 'Entry' },
      { header: 'Content type' },
      { header: 'ID' },
      { header: 'Versión', align: 'center' },
      { header: 'Acción' },
    ],
    rows: items.map(({ saved, current }) => [
      clip(saved.title),
      pc.dim(saved.contentType),
      pc.dim(saved.id),
      `${saved.version} → ${current?.sys.version ?? '—'}`,
      RESTORE_LABEL[restoreStatus(saved, current)],
    ]),
  });
  if (items.some(({ saved, current }) => restoreStatus(saved, current) === RESTORE.CHANGED)) {
    log.warn('Algunas entries se editaron después de la migración: restaurarlas también deshace esos cambios.');
  }

  const { created, fieldsAdded } = data;
  const createdParts = [
    created.entries.length && `${created.entries.length} entry(s)`,
    created.assets.length && `${created.assets.length} imagen(es)`,
    created.contentTypes.length && `${created.contentTypes.length} content type(s)`,
    created.tags.length && `${created.tags.length} tag(s)`,
  ].filter(Boolean);
  if (createdParts.length) {
    log.warn(`Lo que se creó no se borra (la herramienta nunca borra): ${createdParts.join(', ')}.`);
    if (created.entries.length) log.info(`entries: ${clip(created.entries.join(', '), 100)}`);
    if (created.assets.length) log.info(`imágenes: ${clip(created.assets.join(', '), 100)}`);
  }
  const added = Object.entries(fieldsAdded).map(([ctId, ids]) => `${ctId}.${ids.join(`, ${ctId}.`)}`);
  if (added.length) log.info(`Campos agregados al modelo (no se quitan): ${clip(added.join(', '), 100)}`);
}

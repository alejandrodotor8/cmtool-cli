/**
 * Lo que se muestra en la terminal. Solo pinta: no pregunta ni decide nada.
 */
import pc from 'picocolors';
import { log } from './log.mjs';
import { MARK, clip, legend, table } from './table.mjs';
import { ACTION, isWrite } from '../core/plan.mjs';
import { FIELD, fieldType } from '../core/model.mjs';
import { contentTypeOf } from '../core/entries.mjs';

const ACTION_LABEL = {
  [ACTION.CREATE]: pc.green('se crea'),
  [ACTION.UPDATE]: pc.yellow('se actualiza'),
  [ACTION.REUSE]: pc.cyan('ya existe → se reutiliza'),
  [ACTION.ORPHAN]: pc.dim('no se crea (cuelga de una reutilizada)'),
};

const envColumns = (src, dst) => [
  { header: src, align: 'center' },
  { header: dst, align: 'center' },
];

const countActions = (actions, action) => [...actions.values()].filter((a) => a === action).length;

const formatBytes = (n) =>
  n == null ? '' : n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;

/** Árbol padre → hijos, con lo que se hará con cada entry. */
export function renderEntryTree({ src, dst, rootIds, tree, existsInDst, actions, titleOf }) {
  log.step('Entries');
  const rows = [];
  const listed = new Set();

  const walk = (id, prefix, isLast, isRoot) => {
    const lead = pc.dim(prefix + (isRoot ? '' : isLast ? '└─ ' : '├─ '));
    if (tree.broken.has(id)) {
      rows.push([lead + pc.red('(no existe)'), '', pc.dim(id), MARK.no, '', pc.red(`link roto en ${src}, se ignora`)]);
      return;
    }
    const entry = tree.entries.get(id);
    const name = clip(titleOf(entry), 40 - prefix.length);
    const repeated = listed.has(id);
    rows.push([
      lead + (isRoot ? pc.bold(name) : name),
      pc.dim(contentTypeOf(entry)),
      pc.dim(id),
      MARK.yes,
      existsInDst.has(id) ? MARK.yes : MARK.no,
      repeated ? pc.dim('ya listada arriba') : ACTION_LABEL[actions.get(id)],
    ]);
    if (repeated) return;
    listed.add(id);
    const kids = tree.children.get(id);
    const childPrefix = isRoot ? '' : prefix + (isLast ? '   ' : '│  ');
    kids.forEach((kid, i) => walk(kid, childPrefix, i === kids.length - 1, false));
  };
  rootIds.forEach((id) => walk(id, '', true, true));

  const n = (action) => countActions(actions, action);
  const counts = [
    `${n(ACTION.CREATE)} se crean`,
    n(ACTION.UPDATE) && `${n(ACTION.UPDATE)} se actualizan`,
    n(ACTION.REUSE) && `${n(ACTION.REUSE)} se reutilizan`,
    n(ACTION.ORPHAN) && `${n(ACTION.ORPHAN)} no se crean`,
  ].filter(Boolean);

  legend();
  table({
    title: `${pc.bold(`${rootIds.length} padre(s) · ${tree.entries.size - rootIds.length} hijo(s)`)}  ${pc.dim(counts.join(', '))}`,
    columns: [{ header: 'Entry' }, { header: 'Content type' }, { header: 'ID' }, ...envColumns(src, dst), { header: 'Acción' }],
    rows,
  });
}

/** Imágenes y archivos que usan las entries que se escriben. */
export function renderAssets({ src, dst, assets, locales }) {
  log.step('Imágenes y media');
  const locale = locales.src.default;

  const rows = assets.ids.map((id) => {
    const asset = assets.src.get(id);
    const inDst = assets.existing.has(id);
    const dstMark = inDst ? MARK.yes : MARK.no;
    if (!asset) {
      return [pc.red('(no existe)'), pc.dim(id), '', MARK.no, dstMark, inDst ? pc.dim('se reutiliza') : pc.red(`link roto en ${src}`)];
    }
    const file = asset.fields.file?.[locale] ?? Object.values(asset.fields.file ?? {})[0];
    const name = asset.fields.title?.[locale] ?? file?.fileName ?? '(sin nombre)';
    const img = file?.details?.image;
    const detail = [file?.contentType, img && `${img.width}×${img.height}`, formatBytes(file?.details?.size)]
      .filter(Boolean)
      .join(' · ');
    const status = inDst ? pc.green('ya existe → se reutiliza') : pc.yellow(`falta en ${dst}`);
    return [clip(name), pc.dim(id), pc.dim(detail), MARK.yes, dstMark, status];
  });

  table({
    title: `${pc.bold(`${assets.ids.length} archivo(s)`)}  ${pc.dim(`${assets.existing.size} ya existen, ${assets.missing.length} faltan en ${dst}`)}`,
    columns: [{ header: 'Imagen' }, { header: 'ID' }, { header: 'Detalle' }, ...envColumns(src, dst), { header: 'Estado' }],
    rows,
  });
}

function fieldRow({ field, dstField, status }, index, dst) {
  const cells = [clip(field.name, 28), pc.dim(field.id), fieldType(field)];
  const num = pc.dim(String(index + 1));
  switch (status) {
    case FIELD.OK:
      return [num, ...cells, MARK.yes, MARK.yes, pc.green('al día')];
    case FIELD.MISSING:
      return [num, ...cells, MARK.yes, MARK.no, pc.yellow(`falta en ${dst}`)];
    case FIELD.MISMATCH:
      return [num, ...cells, MARK.yes, MARK.diff, pc.red(`en ${dst} es ${fieldType(dstField)} → no se migra`)];
    case FIELD.EXTRA:
      return [pc.dim('·'), ...cells, MARK.no, MARK.yes, pc.cyan(`sobra en ${dst} → se conserva`)];
  }
}

/** Una tabla por content type del árbol, campo por campo, en el orden del modelo de origen. */
export function renderModel({ src, dst, diffs, tree, actions, titleOf }) {
  log.step(`Modelo  ${pc.bold(src)} ${pc.dim('vs')} ${pc.bold(dst)}`);
  legend();

  for (const diff of diffs.values()) {
    const badges = diff.missingCT
      ? [pc.red(`no existe en ${dst}`)]
      : [
          diff.missing.length && pc.yellow(`${diff.missing.length} falta(n)`),
          diff.extra.length && pc.cyan(`${diff.extra.length} sobra(n)`),
          diff.mismatched.length && pc.red(`${diff.mismatched.length} otro tipo`),
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
      rows: diff.rows.map((row, i) => fieldRow(row, i, dst)),
    });
    log.info(`usado por: ${clip(usedBy.join(', '), 90)}`);
  }
}

/** Caja final con todo lo que va a pasar, antes de confirmar. */
export function renderSummary({ src, dst, actions, assets, locales }, plan) {
  log.step('Resumen');
  const created = plan.entries.filter((e) => e.action === ACTION.CREATE).length;
  const reused = countActions(actions, ACTION.REUSE);
  const newFields = [...plan.fieldsToAdd.values()].reduce((n, fields) => n + fields.length, 0);
  const modelChanges = plan.contentTypesToCreate.length + newFields;

  const rows = [['Entries', `${pc.green(`${created} se crean`)} · ${pc.yellow(`${plan.entries.length - created} se actualizan`)}`]];
  if (reused) rows.push(['', pc.cyan(`${reused} hijo(s) ya existen en ${dst} → se reutilizan sin tocarlos`)]);
  if (plan.skipped.length) rows.push(['', pc.red(`${plan.skipped.length} no se migran (content type no existe en ${dst})`)]);
  rows.push([
    'Modelo',
    modelChanges
      ? pc.yellow(`+${plan.contentTypesToCreate.length} content type(s) · +${newFields} campo(s)`) + pc.dim(' (se publica el modelo)')
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
}

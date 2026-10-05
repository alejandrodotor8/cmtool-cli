#!/usr/bin/env node
/**
 * ctf-migrate — migra entries de Contentful (padre + hijos) entre ambientes.
 * Todo queda en DRAFT. Usa la sesión del Contentful CLI (`contentful login`).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from 'contentful-management';
import { select, input, checkbox, confirm, Separator } from '@inquirer/prompts';
import pc from 'picocolors';

// ───────────────────────── utilidades ─────────────────────────

const log = {
  step: (m) => console.log('\n' + pc.bold(pc.cyan('› ' + m))),
  ok: (m) => console.log(pc.green('  ✔ ') + m),
  warn: (m) => console.log(pc.yellow('  ⚠ ') + m),
  err: (m) => console.log(pc.red('  ✖ ') + m),
  info: (m) => console.log(pc.dim('    ' + m)),
};

const isNotFound = (e) => e?.name === 'NotFound' || e?.status === 404;
const chunk = (arr, n) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/** Lee la sesión que dejó `contentful login` (misma búsqueda que el CLI). */
function readCliConfig() {
  const candidates = [];
  if (process.env.CONTENTFUL_CONFIG_FILE) candidates.push(process.env.CONTENTFUL_CONFIG_FILE);
  let dir = process.cwd();
  while (true) {
    candidates.push(path.join(dir, '.contentfulrc.json'));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  candidates.push(path.join(os.homedir(), '.contentfulrc.json'));
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      /* archivo inválido, sigue buscando */
    }
  }
  return {};
}

/** Acepta IDs o URLs de Contentful, separados por coma, espacio o salto de línea. */
function parseEntryIds(text) {
  const ids = text
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((t) => (t.includes('/entries/') ? t.split('/entries/')[1] : t))
    .map((t) => t.split(/[/?#]/)[0]);
  return [...new Set(ids)];
}

/** Recorre cualquier valor (campos, arrays, rich text) y devuelve links a Entry/Asset. */
function collectLinks(value, out = []) {
  if (Array.isArray(value)) value.forEach((v) => collectLinks(v, out));
  else if (value && typeof value === 'object') {
    const sys = value.sys;
    if (sys?.type === 'Link' && (sys.linkType === 'Entry' || sys.linkType === 'Asset')) {
      out.push({ type: sys.linkType, id: sys.id });
    } else {
      Object.values(value).forEach((v) => collectLinks(v, out));
    }
  }
  return out;
}

const fieldSig = (f) => [f.type, f.linkType, f.items?.type, f.items?.linkType].join('|');
const fieldType = (f) =>
  f.type === 'Link' ? `Link ${f.linkType}` : f.type === 'Array' ? `Array<${f.items?.linkType ?? f.items?.type}>` : f.type;

/** Trae por ID las entries/assets que existan en el ambiente. */
async function fetchMany(cma, environmentId, kind, ids) {
  const found = new Map();
  for (const part of chunk(ids, 100)) {
    const res = await cma[kind].getMany({
      environmentId,
      query: { 'sys.id[in]': part.join(','), limit: 100 },
    });
    res.items.forEach((i) => found.set(i.sys.id, i));
  }
  return found;
}

function formatError(e) {
  try {
    const p = JSON.parse(e.message);
    const details = (p.details?.errors ?? [])
      .map((d) => `${d.name}${d.path ? ' en ' + d.path.join('.') : ''}${d.details ? ': ' + d.details : ''}`)
      .join('; ');
    return `${p.status} ${p.statusText}: ${p.message}${details ? ' → ' + details : ''}`;
  } catch {
    return e?.message ?? String(e);
  }
}

// ───────────────────────── tablas ─────────────────────────

const YES = pc.green('✔');
const NO = pc.red('✖');
const DIFF = pc.yellow('≠');

const ANSI = /\x1b\[[0-9;]*m/g;
const width = (s) => String(s).replace(ANSI, '').length;
const pad = (s, n, align = 'left') => {
  const gap = Math.max(0, n - width(s));
  if (align === 'center') return ' '.repeat(Math.floor(gap / 2)) + s + ' '.repeat(Math.ceil(gap / 2));
  return s + ' '.repeat(gap);
};
/** Recorta texto plano (sin color) para que las tablas no se desborden. */
const clip = (s, n = 34) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/**
 * Dibuja una tabla con borde redondeado.
 * columns: [{ header, align }] — sin `header` en ninguna columna, no pinta encabezado.
 * rows: arrays de celdas (pueden traer color).
 */
function table({ title, columns, rows }) {
  const b = pc.dim;
  const widths = columns.map((c, i) => Math.max(width(c.header ?? ''), ...rows.map((r) => width(r[i] ?? ''))));
  const used = widths.reduce((a, w) => a + w, 0) + 2 * (columns.length - 1);
  const inner = Math.max(used, title ? width(title) + 2 : 0);
  widths[widths.length - 1] += inner - used;

  const line = (cells) =>
    b('│ ') + cells.map((c, i) => pad(c ?? '', widths[i], columns[i].align)).join('  ') + b(' │');
  const out = [];
  out.push(title ? b('╭─ ') + title + ' ' + b('─'.repeat(inner - width(title) - 1) + '╮') : b('╭' + '─'.repeat(inner + 2) + '╮'));
  if (columns.some((c) => c.header)) {
    out.push(line(columns.map((c) => pc.bold(c.header ?? ''))));
    out.push(b('├' + '─'.repeat(inner + 2) + '┤'));
  }
  rows.forEach((r) => out.push(line(r)));
  out.push(b('╰' + '─'.repeat(inner + 2) + '╯'));
  console.log(out.map((l) => '  ' + l).join('\n'));
}

const legend = () => console.log(pc.dim(`  ${YES} existe   ${NO} no existe   ${DIFF} tipo distinto`));

const formatBytes = (n) =>
  n == null ? '' : n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;

// ───────────────────────── flujo principal ─────────────────────────

async function main() {
  console.log(pc.bold('\nContentful · migrar entries entre ambientes') + pc.dim('  (todo queda en draft)'));

  const cfg = readCliConfig();
  const token = process.env.CONTENTFUL_MANAGEMENT_TOKEN || cfg.managementToken;
  if (!token) {
    log.err('No encontré una sesión. Corre primero: contentful login');
    process.exit(1);
  }
  const host = cfg.host || 'api.contentful.com';
  const appHost = host.includes('.eu.') ? 'app.eu.contentful.com' : 'app.contentful.com';

  // Space
  const base = createClient({ accessToken: token, host }, { type: 'plain' });
  const spaces = (await base.space.getMany({ query: { limit: 100 } })).items;
  if (!spaces.length) {
    log.err('Tu usuario no tiene acceso a ningún space.');
    process.exit(1);
  }
  const spaceId = await select({
    message: 'Space',
    choices: spaces.map((s) => ({ name: `${s.name} ${pc.dim(s.sys.id)}`, value: s.sys.id })),
    default: cfg.activeSpaceId,
    pageSize: 15,
  });
  const cma = createClient({ accessToken: token, host }, { type: 'plain', defaults: { spaceId } });

  // Ambientes
  const envs = (await cma.environment.getMany({ query: { limit: 100 } })).items.filter(
    (e) => e.sys.status?.sys?.id !== 'failed',
  );
  let aliases = [];
  try {
    aliases = (await cma.environmentAlias.getMany({})).items;
  } catch {
    /* el space no usa aliases */
  }
  if (envs.length < 2) {
    log.err('Este space tiene un solo ambiente; no hay a dónde migrar.');
    process.exit(1);
  }
  const envChoices = envs.map((e) => {
    const al = aliases.filter((a) => a.environment.sys.id === e.sys.id).map((a) => a.sys.id);
    return { name: e.sys.id + (al.length ? pc.dim(`  (alias: ${al.join(', ')})`) : ''), value: e.sys.id };
  });
  const src = await select({ message: 'Ambiente ORIGEN', choices: envChoices, pageSize: 15 });
  const dst = await select({
    message: 'Ambiente DESTINO',
    choices: envChoices.filter((c) => c.value !== src),
    pageSize: 15,
  });

  // Entries
  const rawIds = await input({
    message: 'Entry ID(s) o URL(s) (separados por coma o espacio)',
    validate: (v) => parseEntryIds(v).length > 0 || 'Pega al menos un entry ID',
  });
  const rootIds = parseEntryIds(rawIds);

  // ─── Lectura: padres e hijos ───
  log.step(`Analizando ${pc.bold(src)} ${pc.dim('──▶')} ${pc.bold(dst)}…`);

  // Se recorre el árbol completo en origen, para mostrarlo y revisar el modelo
  // de todos sus content types. Pero solo se escribe:
  //   · lo que pegas (se crea o se actualiza);
  //   · los hijos que no existen en destino, colgando de algo que se escribe (se crean).
  // Un hijo que ya existe en destino se reutiliza sin tocar su contenido.
  const all = new Map(); // id → entry en origen (árbol completo)
  const children = new Map(); // id → ids de entries hijas
  const brokenInSource = new Set();
  const queue = [...rootIds];

  while (queue.length) {
    const id = queue.shift();
    if (all.has(id) || brokenInSource.has(id)) continue;
    let entry;
    try {
      entry = await cma.entry.get({ environmentId: src, entryId: id });
    } catch (e) {
      if (!isNotFound(e)) throw e;
      if (rootIds.includes(id)) {
        log.err(`La entry ${id} no existe en ${src}.`);
        process.exit(1);
      }
      brokenInSource.add(id);
      continue;
    }
    all.set(id, entry);
    const kids = [...new Set(collectLinks(entry.fields).filter((l) => l.type === 'Entry').map((l) => l.id))];
    children.set(id, kids);
    queue.push(...kids);
  }

  const existingEntries = new Set((await fetchMany(cma, dst, 'entry', [...all.keys()])).keys());

  const entries = new Map(); // id → entry en origen que se va a escribir
  const toVisit = [...rootIds];
  while (toVisit.length) {
    const id = toVisit.shift();
    if (entries.has(id) || !all.has(id)) continue;
    entries.set(id, all.get(id));
    toVisit.push(...children.get(id).filter((k) => !existingEntries.has(k)));
  }
  const untouched = [...all.keys()].filter((id) => !entries.has(id));
  const reusedCount = untouched.filter((id) => existingEntries.has(id)).length;
  const orphanCount = untouched.length - reusedCount;

  const assetIds = new Set(
    [...entries.values()].flatMap((e) =>
      collectLinks(e.fields)
        .filter((l) => l.type === 'Asset')
        .map((l) => l.id),
    ),
  );

  const ctOf = (e) => e.sys.contentType.sys.id;
  const ctIds = [...new Set([...all.values()].map(ctOf))];
  const srcCTs = new Map();
  const dstCTs = new Map();
  for (const id of ctIds) {
    srcCTs.set(id, await cma.contentType.get({ environmentId: src, contentTypeId: id }));
    try {
      dstCTs.set(id, await cma.contentType.get({ environmentId: dst, contentTypeId: id }));
    } catch (e) {
      if (!isNotFound(e)) throw e;
      dstCTs.set(id, null);
    }
  }

  const srcLocales = (await cma.locale.getMany({ environmentId: src, query: { limit: 100 } })).items;
  const dstLocales = (await cma.locale.getMany({ environmentId: dst, query: { limit: 100 } })).items;
  const srcLocaleCodes = new Set(srcLocales.map((l) => l.code));
  const dstLocaleCodes = new Set(dstLocales.map((l) => l.code));
  const missingLocales = [...srcLocaleCodes].filter((c) => !dstLocaleCodes.has(c));
  const srcDefault = srcLocales.find((l) => l.default)?.code;
  const dstDefault = dstLocales.find((l) => l.default)?.code;

  const srcAssets = await fetchMany(cma, src, 'asset', [...assetIds]);
  const existingAssets = new Set((await fetchMany(cma, dst, 'asset', [...assetIds])).keys());
  const missingAssets = [...assetIds].filter((id) => !existingAssets.has(id) && srcAssets.has(id));

  const tagIds = [
    ...new Set([...entries.values()].flatMap((e) => (e.metadata?.tags ?? []).map((t) => t.sys.id))),
  ];
  const dstTagIds = new Set();
  if (tagIds.length) {
    const t = await cma.tag.getMany({ environmentId: dst, query: { limit: 1000 } });
    t.items.forEach((x) => dstTagIds.add(x.sys.id));
  }
  const missingTags = tagIds.filter((id) => !dstTagIds.has(id));

  const titleOf = (entry) => {
    const ct = srcCTs.get(ctOf(entry));
    const v = entry.fields?.[ct?.displayField];
    const t = v?.[srcDefault] ?? (v && Object.values(v)[0]);
    return typeof t === 'string' ? t : '(sin título)';
  };

  // ─── 1. Padres e hijos ───
  log.step('Entries');
  const entryRows = [];
  const listed = new Set();
  const walk = (id, prefix, isLast, isRoot) => {
    const lead = pc.dim(prefix + (isRoot ? '' : isLast ? '└─ ' : '├─ '));
    const room = 40 - prefix.length;
    if (brokenInSource.has(id)) {
      entryRows.push([lead + pc.red('(no existe)'), '', pc.dim(id), NO, '', pc.red(`link roto en ${src}, se ignora`)]);
      return;
    }
    const e = all.get(id);
    const name = clip(titleOf(e), room);
    const repeated = listed.has(id);
    const action = repeated
      ? pc.dim('ya listada arriba')
      : !entries.has(id)
        ? existingEntries.has(id)
          ? pc.cyan('ya existe → se reutiliza')
          : pc.dim('no se crea (cuelga de una reutilizada)')
        : existingEntries.has(id)
          ? pc.yellow('se actualiza')
          : pc.green('se crea');
    entryRows.push([
      lead + (isRoot ? pc.bold(name) : name),
      pc.dim(ctOf(e)),
      pc.dim(id),
      YES,
      existingEntries.has(id) ? YES : NO,
      action,
    ]);
    if (repeated) return;
    listed.add(id);
    const kids = children.get(id);
    const childPrefix = isRoot ? '' : prefix + (isLast ? '   ' : '│  ');
    kids.forEach((k, i) => walk(k, childPrefix, i === kids.length - 1, false));
  };
  rootIds.forEach((id) => walk(id, '', true, true));

  const childCount = all.size - rootIds.length;
  const newCount = [...entries.keys()].filter((id) => !existingEntries.has(id)).length;
  const updateCount = entries.size - newCount;
  legend();
  table({
    title: `${pc.bold(`${rootIds.length} padre(s) · ${childCount} hijo(s)`)}  ${pc.dim(
      [
        `${newCount} se crean`,
        updateCount && `${updateCount} se actualizan`,
        reusedCount && `${reusedCount} se reutilizan`,
        orphanCount && `${orphanCount} no se crean`,
      ]
        .filter(Boolean)
        .join(', '),
    )}`,
    columns: [
      { header: 'Entry' },
      { header: 'Content type' },
      { header: 'ID' },
      { header: src, align: 'center' },
      { header: dst, align: 'center' },
      { header: 'Acción' },
    ],
    rows: entryRows,
  });

  // ─── 2. Imágenes ───
  let withAssets = false;
  if (assetIds.size) {
    log.step('Imágenes y media');
    const assetRows = [...assetIds].map((id) => {
      const a = srcAssets.get(id);
      const inDst = existingAssets.has(id);
      if (!a) {
        return [pc.red('(no existe)'), pc.dim(id), '', NO, inDst ? YES : NO, inDst ? pc.dim('se reutiliza') : pc.red(`link roto en ${src}`)];
      }
      const file = a.fields.file?.[srcDefault] ?? Object.values(a.fields.file ?? {})[0];
      const name = a.fields.title?.[srcDefault] ?? file?.fileName ?? '(sin nombre)';
      const img = file?.details?.image;
      const detail = [file?.contentType, img && `${img.width}×${img.height}`, formatBytes(file?.details?.size)]
        .filter(Boolean)
        .join(' · ');
      return [clip(name), pc.dim(id), pc.dim(detail), YES, inDst ? YES : NO, inDst ? pc.green('ya existe → se reutiliza') : pc.yellow(`falta en ${dst}`)];
    });
    table({
      title: `${pc.bold(`${assetIds.size} archivo(s)`)}  ${pc.dim(`${existingAssets.size} ya existen, ${missingAssets.length} faltan en ${dst}`)}`,
      columns: [
        { header: 'Imagen' },
        { header: 'ID' },
        { header: 'Detalle' },
        { header: src, align: 'center' },
        { header: dst, align: 'center' },
        { header: 'Estado' },
      ],
      rows: assetRows,
    });
    if (missingAssets.length) {
      withAssets = await confirm({
        message: `¿Migrar con imágenes? (se crean las ${missingAssets.length} que faltan y se reutilizan las que ya existen)`,
        default: true,
      });
      if (!withAssets) {
        log.warn(`Las entries quedarán apuntando a ${missingAssets.length} imagen(es) que no existen en ${dst}; no se podrán publicar hasta que existan.`);
      }
    }
  }

  // ─── 3. Modelo ───
  log.step(`Modelo  ${pc.bold(src)} ${pc.dim('vs')} ${pc.bold(dst)}`);
  const model = ctIds.map((id) => {
    const s = srcCTs.get(id);
    const d = dstCTs.get(id);
    if (!d) return { id, missingCT: true, missing: s.fields, extra: [], mismatched: [] };
    const dById = new Map(d.fields.map((f) => [f.id, f]));
    const srcFieldIds = new Set(s.fields.map((f) => f.id));
    return {
      id,
      missingCT: false,
      missing: s.fields.filter((f) => !dById.has(f.id)),
      extra: d.fields.filter((f) => !srcFieldIds.has(f.id)),
      mismatched: s.fields
        .filter((f) => dById.has(f.id) && fieldSig(f) !== fieldSig(dById.get(f.id)))
        .map((f) => ({ id: f.id, src: f, dst: dById.get(f.id) })),
    };
  });

  legend();
  for (const m of model) {
    const s = srcCTs.get(m.id);
    const dById = new Map((dstCTs.get(m.id)?.fields ?? []).map((f) => [f.id, f]));

    const rows = s.fields.map((f, i) => {
      const df = dById.get(f.id);
      let mark = YES;
      let status = pc.green('al día');
      if (!df) {
        mark = NO;
        status = pc.yellow(`falta en ${dst}`);
      } else if (fieldSig(f) !== fieldSig(df)) {
        mark = DIFF;
        status = pc.red(`en ${dst} es ${fieldType(df)} → no se migra`);
      }
      return [pc.dim(String(i + 1)), clip(f.name, 28), pc.dim(f.id), fieldType(f), YES, mark, status];
    });
    m.extra.forEach((f) =>
      rows.push([pc.dim('·'), clip(f.name, 28), pc.dim(f.id), fieldType(f), NO, YES, pc.cyan(`sobra en ${dst} → se conserva`)]),
    );

    const badges = m.missingCT
      ? [pc.red(`no existe en ${dst}`)]
      : [
          m.missing.length && pc.yellow(`${m.missing.length} falta(n)`),
          m.extra.length && pc.cyan(`${m.extra.length} sobra(n)`),
          m.mismatched.length && pc.red(`${m.mismatched.length} otro tipo`),
        ].filter(Boolean);
    const usedBy = [...all.values()]
      .filter((e) => ctOf(e) === m.id)
      .map((e) => titleOf(e) + (entries.has(e.sys.id) ? '' : ' (reutilizada)'));

    console.log();
    table({
      title: `${pc.bold(s.name)} ${pc.dim(m.id)}  ${badges.length ? badges.join(pc.dim(' · ')) : pc.green('al día')}`,
      columns: [
        { header: '#' },
        { header: 'Campo' },
        { header: 'ID' },
        { header: 'Tipo' },
        { header: src, align: 'center' },
        { header: dst, align: 'center' },
        { header: 'Estado' },
      ],
      rows,
    });
    log.info(`usado por: ${clip(usedBy.join(', '), 90)}`);
  }

  const writesCT = (ctId) => [...entries.values()].some((e) => ctOf(e) === ctId);
  const modelChoices = [];
  for (const m of model) {
    const s = srcCTs.get(m.id);
    if (!m.missingCT && !m.missing.length) continue;
    // Un content type que solo usan entries que no se escriben no hace falta crearlo.
    if (m.missingCT && !writesCT(m.id)) continue;
    const note = writesCT(m.id) ? '' : '  · solo entries reutilizadas: se agrega el campo, su contenido no se copia';
    modelChoices.push(new Separator(pc.dim(`── ${s.name} (${m.id})${note}`)));
    if (m.missingCT) {
      modelChoices.push({
        name: `Crear content type completo ${pc.dim(`(${m.missing.length} campos; si no, sus entries no se migran)`)}`,
        value: { ctId: m.id },
      });
      continue;
    }
    const w = Math.max(...m.missing.map((f) => clip(f.name, 28).length));
    for (const f of m.missing) {
      modelChoices.push({
        name: `${pad(clip(f.name, 28), w)}  ${pc.dim(pad(f.id, 20))} ${pc.dim(fieldType(f))}`,
        value: { ctId: m.id, field: f },
      });
    }
  }
  let picked = [];
  if (modelChoices.length) {
    console.log();
    picked = await checkbox({
      message: `¿Qué agrego al modelo de ${pc.bold(dst)}? ${pc.dim('(espacio marca · a marca todo · enter continúa · sin marcar = no se toca)')}`,
      choices: modelChoices,
      pageSize: 20,
    });
  }
  const createCTs = new Set(picked.filter((p) => !p.field).map((p) => p.ctId));
  const addFields = new Map();
  for (const p of picked.filter((p) => p.field)) {
    addFields.set(p.ctId, [...(addFields.get(p.ctId) ?? []), p.field]);
  }
  const skippedCTs = new Set(model.filter((m) => m.missingCT && !createCTs.has(m.id)).map((m) => m.id));
  const skipped = [...entries.values()].filter((e) => skippedCTs.has(ctOf(e))).map((e) => e.sys.id);
  const notAdded = model.flatMap((m) =>
    m.missingCT
      ? []
      : m.missing.filter((f) => !addFields.get(m.id)?.some((a) => a.id === f.id)).map((f) => `${m.id}.${f.id}`),
  );

  // ─── Resumen ───
  log.step('Resumen');
  const toMigrate = [...entries.keys()].filter((id) => !skipped.includes(id));
  const toCreate = toMigrate.filter((id) => !existingEntries.has(id)).length;
  const nFields = [...addFields.values()].reduce((n, fs) => n + fs.length, 0);
  const summary = [
    ['Entries', `${pc.green(`${toCreate} se crean`)} · ${pc.yellow(`${toMigrate.length - toCreate} se actualizan`)}`],
  ];
  if (reusedCount) summary.push(['', pc.cyan(`${reusedCount} hijo(s) ya existen en ${dst} → se reutilizan sin tocarlos`)]);
  if (skipped.length) {
    summary.push(['', pc.red(`${skipped.length} no se migran (content type no existe en ${dst})`)]);
  }
  summary.push([
    'Modelo',
    picked.length
      ? pc.yellow(`+${createCTs.size} content type(s) · +${nFields} campo(s)`) + pc.dim(' (se publica el modelo)')
      : pc.dim('sin cambios'),
  ]);
  if (notAdded.length) summary.push(['', pc.dim(`no se migran: ${clip(notAdded.join(', '), 70)}`)]);
  if (assetIds.size) {
    summary.push([
      'Imágenes',
      withAssets
        ? `${pc.green(`${missingAssets.length} se crean`)} · ${existingAssets.size} se reutilizan`
        : `${existingAssets.size} se reutilizan${missingAssets.length ? pc.red(` · ${missingAssets.length} no se crean`) : ''}`,
    ]);
  }
  if (missingTags.length) summary.push(['Tags', pc.green(`${missingTags.length} se crean`)]);
  if (missingLocales.length) summary.push(['Locales', pc.dim(`se omiten: ${missingLocales.join(', ')}`)]);
  table({
    title: `${pc.bold(src)} ${pc.dim('──▶')} ${pc.bold(dst)}  ${pc.dim('todo queda en draft')}`,
    columns: [{}, {}],
    rows: summary.map(([k, v]) => [pc.bold(k), v]),
  });
  if (skipped.length) log.warn(`Quien use estas entries quedará con links rotos: ${skipped.join(', ')}`);

  if (!toMigrate.length) {
    log.err('No queda nada para migrar.');
    process.exit(1);
  }
  const go = await confirm({ message: `¿Migrar a ${pc.bold(dst)} como draft?`, default: true });
  if (!go) return console.log(pc.dim('\nCancelado.'));

  // ─── Ejecución ───
  const failures = [];
  const run = async (label, fn) => {
    try {
      await fn();
      log.ok(label);
    } catch (e) {
      failures.push(label);
      log.err(`${label} → ${formatError(e)}`);
    }
  };

  if (missingTags.length) {
    log.step('Tags');
    for (const tagId of missingTags) {
      await run(`tag ${tagId}`, async () => {
        const t = await cma.tag.get({ environmentId: src, tagId });
        await cma.tag.createWithId(
          { environmentId: dst, tagId },
          { name: t.name, sys: { visibility: t.sys.visibility ?? 'private' } },
        );
        dstTagIds.add(tagId);
      });
    }
  }

  if (picked.length) {
    log.step('Modelo');
    for (const ctId of createCTs) {
      await run(`content type ${ctId} creado`, async () => {
        const s = srcCTs.get(ctId);
        const ct = await cma.contentType.createWithId(
          { environmentId: dst, contentTypeId: ctId },
          { name: s.name, description: s.description, displayField: s.displayField, fields: s.fields },
        );
        dstCTs.set(ctId, await cma.contentType.publish({ environmentId: dst, contentTypeId: ctId }, ct));
      });
    }
    for (const [ctId, fields] of addFields) {
      await run(`${ctId}: +${fields.map((f) => f.id).join(', ')}`, async () => {
        const cur = dstCTs.get(ctId);
        const ct = await cma.contentType.update(
          { environmentId: dst, contentTypeId: ctId },
          { ...cur, fields: [...cur.fields, ...fields] },
        );
        dstCTs.set(ctId, await cma.contentType.publish({ environmentId: dst, contentTypeId: ctId }, ct));
      });
    }
  }

  const filterLocales = (byLocale) =>
    Object.fromEntries(Object.entries(byLocale ?? {}).filter(([loc]) => dstLocaleCodes.has(loc)));
  const dstOnlyLocales = (byLocale) =>
    Object.fromEntries(Object.entries(byLocale ?? {}).filter(([loc]) => !srcLocaleCodes.has(loc)));

  if (withAssets) {
    log.step('Imágenes');
    for (const assetId of missingAssets) {
      await run(`asset ${assetId} creado (draft)`, async () => {
        const a = srcAssets.get(assetId);
        const file = {};
        for (const [loc, f] of Object.entries(filterLocales(a.fields.file))) {
          const url = f.url ? (f.url.startsWith('//') ? 'https:' + f.url : f.url) : f.upload;
          file[loc] = { contentType: f.contentType, fileName: f.fileName, upload: url };
        }
        const fields = { file };
        if (a.fields.title) fields.title = filterLocales(a.fields.title);
        if (a.fields.description) fields.description = filterLocales(a.fields.description);
        const created = await cma.asset.createWithId({ environmentId: dst, assetId }, { fields });
        await cma.asset.processForAllLocales({ environmentId: dst }, created);
      });
    }
  }

  log.step('Entries');
  const mismatchedBy = new Map(model.map((m) => [m.id, new Set(m.mismatched.map((f) => f.id))]));
  for (const id of toMigrate) {
    const e = entries.get(id);
    const ctId = ctOf(e);
    const label = `${titleOf(e)} ${pc.dim(id)}`;
    const dstCT = dstCTs.get(ctId);
    if (!dstCT) {
      failures.push(id);
      log.err(`${label}: el content type "${ctId}" no se pudo crear en ${dst}`);
      continue;
    }

    // Solo campos que existen en ambos modelos con el mismo tipo.
    const dstFields = new Map(dstCT.fields.filter((f) => !mismatchedBy.get(ctId).has(f.id)).map((f) => [f.id, f]));
    const fields = {};
    for (const [k, byLocale] of Object.entries(e.fields)) {
      const f = dstFields.get(k);
      if (!f) continue;
      const v = f.localized
        ? filterLocales(byLocale)
        : dstDefault in byLocale
          ? { [dstDefault]: byLocale[dstDefault] }
          : {};
      if (Object.keys(v).length) fields[k] = v;
    }
    const tags = (e.metadata?.tags ?? []).filter((t) => dstTagIds.has(t.sys.id));

    if (existingEntries.has(id)) {
      await run(`${label} actualizada ${pc.dim('(queda Changed si estaba publicada)')}`, async () => {
        const cur = await cma.entry.get({ environmentId: dst, entryId: id });
        // Lo que solo existe en destino (campos de sobra, otro tipo, locales propios) se conserva.
        const merged = { ...cur.fields };
        for (const k of dstFields.keys()) {
          const v = { ...dstOnlyLocales(cur.fields[k]), ...(fields[k] ?? {}) };
          if (Object.keys(v).length) merged[k] = v;
          else delete merged[k];
        }
        await cma.entry.update(
          { environmentId: dst, entryId: id },
          { ...cur, fields: merged, metadata: { ...(cur.metadata ?? {}), tags } },
        );
      });
    } else {
      await run(`${label} creada (draft)`, () =>
        cma.entry.createWithId({ environmentId: dst, entryId: id, contentTypeId: ctId }, { fields, metadata: { tags } }),
      );
    }
  }

  // ─── Final ───
  log.step(failures.length ? `Terminado con ${failures.length} error(es)` : 'Listo. Nada fue publicado.');
  for (const id of rootIds) {
    log.info(`https://${appHost}/spaces/${spaceId}/environments/${dst}/entries/${id}`);
  }
  if (failures.length) process.exit(1);
}

main().catch((e) => {
  if (e?.name === 'ExitPromptError') {
    console.log(pc.dim('\nCancelado.'));
    process.exit(0);
  }
  const msg = formatError(e);
  log.err(msg);
  if (msg.startsWith('401')) log.info('Tu sesión expiró. Corre: contentful login');
  process.exit(1);
});

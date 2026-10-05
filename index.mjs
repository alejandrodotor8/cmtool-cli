#!/usr/bin/env node
/**
 * ctf-migrate — migra entries de Contentful entre ambientes de forma interactiva.
 * Todo queda en DRAFT. Usa la sesión del Contentful CLI (`contentful login`).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from 'contentful-management';
import { select, input, confirm } from '@inquirer/prompts';
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

/** Devuelve el Set de IDs que sí existen en el ambiente. */
async function existingIds(cma, environmentId, kind, ids) {
  const found = new Set();
  for (const part of chunk(ids, 100)) {
    const res = await cma[kind].getMany({
      environmentId,
      query: { 'sys.id[in]': part.join(','), limit: 100 },
    });
    res.items.forEach((i) => found.add(i.sys.id));
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

  // 1. Space
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

  // 2. Ambientes
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

  // 3. Entries
  const rawIds = await input({
    message: 'Entry ID(s) o URL(s) (separados por coma o espacio)',
    validate: (v) => parseEntryIds(v).length > 0 || 'Pega al menos un entry ID',
  });
  const rootIds = parseEntryIds(rawIds);

  // ─── Análisis ───
  log.step(`Analizando ${src} → ${dst}…`);

  const entries = new Map();
  const assetIds = new Set();
  const externalRefs = new Set();

  for (const id of rootIds) {
    let entry;
    try {
      entry = await cma.entry.get({ environmentId: src, entryId: id });
    } catch (e) {
      if (!isNotFound(e)) throw e;
      log.err(`La entry ${id} no existe en ${src}.`);
      process.exit(1);
    }
    entries.set(id, entry);
    for (const l of collectLinks(entry.fields)) {
      if (l.type === 'Asset') assetIds.add(l.id);
      else if (!rootIds.includes(l.id)) externalRefs.add(l.id);
    }
  }

  // Content types
  const ctIds = [...new Set([...entries.values()].map((e) => e.sys.contentType.sys.id))];
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

  const modelDiff = [];
  for (const id of ctIds) {
    const s = srcCTs.get(id);
    const d = dstCTs.get(id);
    if (!d) {
      modelDiff.push({ ctId: id, missingCT: true, missingFields: s.fields, mismatched: [] });
      continue;
    }
    const byId = new Map(d.fields.map((f) => [f.id, f]));
    const missingFields = s.fields.filter((f) => !byId.has(f.id));
    const mismatched = s.fields.filter((f) => byId.has(f.id) && fieldSig(f) !== fieldSig(byId.get(f.id)));
    if (missingFields.length || mismatched.length) {
      modelDiff.push({ ctId: id, missingCT: false, missingFields, mismatched });
    }
  }

  // Locales
  const srcLocales = (await cma.locale.getMany({ environmentId: src, query: { limit: 100 } })).items;
  const dstLocales = (await cma.locale.getMany({ environmentId: dst, query: { limit: 100 } })).items;
  const dstLocaleCodes = new Set(dstLocales.map((l) => l.code));
  const missingLocales = srcLocales.map((l) => l.code).filter((c) => !dstLocaleCodes.has(c));
  const defaultLocale = srcLocales.find((l) => l.default)?.code;

  // Qué ya existe en destino
  const existingEntries = await existingIds(cma, dst, 'entry', [...entries.keys()]);
  const existingAssets = await existingIds(cma, dst, 'asset', [...assetIds]);
  const missingAssets = [...assetIds].filter((id) => !existingAssets.has(id));
  const existingExternal = await existingIds(cma, dst, 'entry', [...externalRefs]);
  const brokenRefs = [...externalRefs].filter((id) => !existingExternal.has(id));

  // Tags
  const tagIds = [
    ...new Set([...entries.values()].flatMap((e) => (e.metadata?.tags ?? []).map((t) => t.sys.id))),
  ];
  const dstTagIds = new Set();
  if (tagIds.length) {
    const t = await cma.tag.getMany({ environmentId: dst, query: { limit: 1000 } });
    t.items.forEach((x) => dstTagIds.add(x.sys.id));
  }
  const missingTags = tagIds.filter((id) => !dstTagIds.has(id));

  // ─── Plan ───
  const titleOf = (entry) => {
    const ct = srcCTs.get(entry.sys.contentType.sys.id);
    const v = entry.fields?.[ct?.displayField];
    const t = v?.[defaultLocale] ?? (v && Object.values(v)[0]);
    return typeof t === 'string' ? t : '(sin título)';
  };

  log.step('Plan');
  for (const id of rootIds) {
    const e = entries.get(id);
    log.ok(`${pc.bold(titleOf(e))} ${pc.dim(`${id} · ${e.sys.contentType.sys.id}`)}`);
  }
  const newCount = [...entries.keys()].filter((id) => !existingEntries.has(id)).length;
  log.info(`Entries: ${entries.size} · ${newCount} nuevas, ${entries.size - newCount} se actualizan`);

  // Modelo
  const blocking = modelDiff.filter((d) => d.mismatched.length);
  if (blocking.length) {
    for (const d of blocking) {
      for (const f of d.mismatched) {
        log.err(`${d.ctId}.${f.id}: el tipo del campo es distinto en ${src} y ${dst}.`);
      }
    }
    log.info('Esto no se resuelve automáticamente. Alinea el modelo con una migración y vuelve a intentar.');
    process.exit(1);
  }

  let modelMode = 'none';
  if (modelDiff.length) {
    log.warn(`El modelo en ${dst} está desactualizado:`);
    for (const d of modelDiff) {
      if (d.missingCT) log.info(`• content type "${d.ctId}" no existe`);
      else log.info(`• ${d.ctId}: faltan ${d.missingFields.map((f) => `"${f.id}"`).join(', ')}`);
    }
    const anyMissingCT = modelDiff.some((d) => d.missingCT);
    modelMode = await select({
      message: '¿Qué hago con el modelo?',
      choices: [
        { name: `Agregar lo que falta al modelo de ${dst}`, value: 'sync' },
        ...(anyMissingCT
          ? []
          : [{ name: 'Migrar sin esos campos (su contenido no llega a destino)', value: 'omit' }]),
        { name: 'Cancelar', value: 'cancel' },
      ],
    });
    if (modelMode === 'cancel') return console.log(pc.dim('\nCancelado.'));
  }

  // Assets
  if (missingAssets.length) {
    log.info(`Assets: ${missingAssets.length} se crearán (${existingAssets.size} ya existen y se reutilizan)`);
  } else if (assetIds.size) {
    log.info(`Assets: los ${assetIds.size} ya existen en ${dst} y se reutilizan`);
  }

  if (brokenRefs.length) {
    log.warn(
      `${brokenRefs.length} entry(s) enlazada(s) no existen en ${dst}; esos links quedarán rotos y la entry no se podrá publicar hasta que existan: ${brokenRefs.join(', ')}`,
    );
  }
  if (missingLocales.length) log.warn(`Locales que no existen en ${dst} (se omiten): ${missingLocales.join(', ')}`);
  if (missingTags.length) log.info(`Tags: ${missingTags.length} se crearán`);

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

  if (modelMode === 'sync') {
    log.step('Modelo');
    for (const d of modelDiff) {
      await run(d.missingCT ? `content type ${d.ctId} creado` : `${d.ctId}: +${d.missingFields.length} campo(s)`, async () => {
        const s = srcCTs.get(d.ctId);
        let ct;
        if (d.missingCT) {
          ct = await cma.contentType.createWithId(
            { environmentId: dst, contentTypeId: d.ctId },
            { name: s.name, description: s.description, displayField: s.displayField, fields: s.fields },
          );
        } else {
          const cur = dstCTs.get(d.ctId);
          ct = await cma.contentType.update(
            { environmentId: dst, contentTypeId: d.ctId },
            { ...cur, fields: [...cur.fields, ...d.missingFields] },
          );
        }
        ct = await cma.contentType.publish({ environmentId: dst, contentTypeId: d.ctId }, ct);
        dstCTs.set(d.ctId, ct);
      });
    }
  }

  const filterLocales = (byLocale) =>
    Object.fromEntries(Object.entries(byLocale ?? {}).filter(([loc]) => dstLocaleCodes.has(loc)));

  if (missingAssets.length) {
    log.step('Assets');
    for (const assetId of missingAssets) {
      await run(`asset ${assetId} (draft)`, async () => {
        const a = await cma.asset.get({ environmentId: src, assetId });
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
  for (const [id, e] of entries) {
    const ctId = e.sys.contentType.sys.id;
    const dstCT = dstCTs.get(ctId);
    if (!dstCT) {
      failures.push(id);
      log.err(`${id}: el content type "${ctId}" no existe en ${dst}`);
      continue;
    }
    const allowed = new Set(dstCT.fields.map((f) => f.id));
    const fields = Object.fromEntries(
      Object.entries(e.fields)
        .filter(([k]) => allowed.has(k))
        .map(([k, v]) => [k, filterLocales(v)]),
    );
    const tags = (e.metadata?.tags ?? []).filter((t) => dstTagIds.has(t.sys.id));

    if (existingEntries.has(id)) {
      await run(`${id} actualizada ${pc.dim('(queda Changed si estaba publicada)')}`, async () => {
        const cur = await cma.entry.get({ environmentId: dst, entryId: id });
        await cma.entry.update(
          { environmentId: dst, entryId: id },
          { ...cur, fields, metadata: { ...(cur.metadata ?? {}), tags } },
        );
      });
    } else {
      await run(`${id} creada (draft)`, () =>
        cma.entry.createWithId(
          { environmentId: dst, entryId: id, contentTypeId: ctId },
          { fields, metadata: { tags } },
        ),
      );
    }
  }

  // ─── Resumen ───
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

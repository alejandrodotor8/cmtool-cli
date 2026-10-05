/**
 * Paso final: aplica el plan con el writer. Si algo falla, sigue con lo demás y
 * devuelve la lista de fallos.
 */
import pc from 'picocolors';
import { log } from './ui/log.mjs';
import { formatError } from './errors.mjs';
import { ACTION } from './core/plan.mjs';
import { contentTypeOf } from './core/entries.mjs';
import { assetFieldsForDestination, fieldsForDestination, mergeWithExisting } from './core/fields.mjs';

export async function executePlan(plan, analysis, writer) {
  const { titleOf, locales, diffs } = analysis;
  const dstCTs = new Map(analysis.contentTypes.dst); // se actualiza con los cambios de modelo
  const dstTagIds = new Set(analysis.tags.dstIds);
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

  if (plan.tagsToCreate.length) {
    log.step('Tags');
    for (const tag of plan.tagsToCreate) {
      await run(`tag ${tag.sys.id}`, async () => {
        await writer.createTag(tag);
        dstTagIds.add(tag.sys.id);
      });
    }
  }

  if (plan.contentTypesToCreate.length || plan.fieldsToAdd.size) {
    log.step('Modelo');
    for (const ct of plan.contentTypesToCreate) {
      await run(`content type ${ct.sys.id} creado`, async () => {
        dstCTs.set(ct.sys.id, await writer.createContentType(ct));
      });
    }
    for (const [ctId, fields] of plan.fieldsToAdd) {
      await run(`${ctId}: +${fields.map((f) => f.id).join(', ')}`, async () => {
        dstCTs.set(ctId, await writer.addFields(dstCTs.get(ctId), fields));
      });
    }
  }

  if (plan.assetsToCreate.length) {
    log.step('Imágenes');
    for (const asset of plan.assetsToCreate) {
      await run(`asset ${asset.sys.id} creado (draft)`, () =>
        writer.createAsset(asset.sys.id, assetFieldsForDestination(asset, locales.dst)),
      );
    }
  }

  log.step('Entries');
  for (const { id, action, entry } of plan.entries) {
    const ctId = contentTypeOf(entry);
    const label = `${titleOf(entry)} ${pc.dim(id)}`;
    const dstCT = dstCTs.get(ctId);
    if (!dstCT) {
      failures.push(label);
      log.err(`${label}: el content type "${ctId}" no se pudo crear en ${writer.environment}`);
      continue;
    }

    // Solo campos que existen en ambos modelos con el mismo tipo.
    const mismatched = new Set(diffs.get(ctId).mismatched.map((f) => f.id));
    const writable = new Map(dstCT.fields.filter((f) => !mismatched.has(f.id)).map((f) => [f.id, f]));
    const fields = fieldsForDestination(entry, writable, locales.dst);
    const tags = (entry.metadata?.tags ?? []).filter((t) => dstTagIds.has(t.sys.id));

    if (action === ACTION.UPDATE) {
      await run(`${label} actualizada ${pc.dim('(queda Changed si estaba publicada)')}`, () =>
        writer.updateEntry(id, (current) => mergeWithExisting(current, fields, writable, locales.src), tags),
      );
    } else {
      await run(`${label} creada (draft)`, () => writer.createEntry(id, ctId, fields, tags));
    }
  }

  return failures;
}

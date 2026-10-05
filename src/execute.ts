/**
 * Paso final: aplica el plan con el writer y deja todo anotado en el respaldo.
 * Si algo falla, sigue con lo demás y devuelve la lista de fallos.
 */
import pc from 'picocolors';
import type { Analysis } from './analyze.ts';
import type { Backup } from './backup.ts';
import type { Writer } from './contentful/write.ts';
import { contentTypeOf } from './core/entries.ts';
import { assetFieldsForDestination, fieldsForDestination, mergeWithExisting } from './core/fields.ts';
import { ACTION, type Plan } from './core/plan.ts';
import { log } from './ui/log.ts';
import { createRunner } from './ui/runner.ts';

export async function executePlan(plan: Plan, analysis: Analysis, writer: Writer, backup: Backup): Promise<string[]> {
  const { titleOf, locales, diffs } = analysis;
  const dstCTs = new Map(analysis.contentTypes.dst); // se actualiza con los cambios de modelo
  const dstTagIds = new Set(analysis.tags.dstIds);
  const { run, fail, failures } = createRunner();

  if (plan.tagsToCreate.length) {
    log.step('Tags');
    for (const tag of plan.tagsToCreate) {
      await run(`tag ${tag.sys.id}`, async () => {
        await writer.createTag(tag);
        dstTagIds.add(tag.sys.id);
        backup.recordCreated('tags', tag.sys.id);
      });
    }
  }

  if (plan.contentTypesToCreate.length || plan.fieldsToAdd.size) {
    log.step('Modelo');
    for (const ct of plan.contentTypesToCreate) {
      await run(`content type ${ct.sys.id} creado`, async () => {
        dstCTs.set(ct.sys.id, await writer.createContentType(ct));
        backup.recordCreated('contentTypes', ct.sys.id);
      });
    }
    for (const [ctId, fields] of plan.fieldsToAdd) {
      await run(`${ctId}: +${fields.map((f) => f.id).join(', ')}`, async () => {
        const current = dstCTs.get(ctId);
        if (!current) throw new Error(`el content type "${ctId}" no existe en ${writer.environment}`);
        dstCTs.set(ctId, await writer.addFields(current, fields));
        backup.recordFields(
          ctId,
          fields.map((f) => f.id),
        );
      });
    }
  }

  if (plan.assetsToCreate.length) {
    log.step('Imágenes');
    for (const asset of plan.assetsToCreate) {
      await run(`asset ${asset.sys.id} creado (draft)`, async () => {
        await writer.createAsset(asset.sys.id, assetFieldsForDestination(asset, locales.dst));
        backup.recordCreated('assets', asset.sys.id);
      });
    }
  }

  log.step('Entries');
  for (const { id, action, entry } of plan.entries) {
    const ctId = contentTypeOf(entry);
    const title = titleOf(entry);
    const label = `${title} ${pc.dim(id)}`;
    const dstCT = dstCTs.get(ctId);
    if (!dstCT) {
      fail(label, `el content type "${ctId}" no se pudo crear en ${writer.environment}`);
      continue;
    }

    // Solo campos que existen en ambos modelos con el mismo tipo.
    const mismatched = new Set((diffs.get(ctId)?.mismatched ?? []).map((f) => f.id));
    const writable = new Map(dstCT.fields.filter((f) => !mismatched.has(f.id)).map((f) => [f.id, f]));
    const fields = fieldsForDestination(entry, writable, locales.dst);
    const tags = (entry.metadata?.tags ?? []).filter((t) => dstTagIds.has(t.sys.id));

    if (action === ACTION.UPDATE) {
      await run(`${label} actualizada ${pc.dim('(queda Changed si estaba publicada)')}`, () =>
        writer.updateEntry(
          id,
          (current) => mergeWithExisting(current, fields, writable, locales.src),
          tags,
          (current) => backup.recordUpdate(current, title),
        ),
      );
    } else {
      await run(`${label} creada (draft)`, async () => {
        await writer.createEntry(id, ctId, fields, tags);
        backup.recordCreated('entries', id);
      });
    }
  }

  return failures;
}

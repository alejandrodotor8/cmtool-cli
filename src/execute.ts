/**
 * Escritura por fases (tags, modelo, imágenes, entries). Cada fase se puede usar sola:
 * "migrar modelo" usa applyModelChanges y "migrar imágenes" usa applyAssets.
 * Todo queda anotado en el respaldo; si algo falla, se sigue con lo demás.
 */
import pc from 'picocolors';
import type { Analysis } from './analyze.ts';
import type { Backup } from './backup.ts';
import type { Asset, ContentType, EditorInterface, Field, Locales, Tag } from './contentful/types.ts';
import type { Writer } from './contentful/write.ts';
import { mergeControls } from './core/editor.ts';
import { contentTypeOf } from './core/entries.ts';
import { assetFieldsForDestination, fieldsForDestination, mergeWithExisting } from './core/fields.ts';
import type { ModelChanges } from './core/model-changes.ts';
import { ACTION, type Plan } from './core/plan.ts';
import { writableFields } from './core/publish-check.ts';
import type { createRunner } from './ui/runner.ts';

/** Lo que necesita cualquier fase para escribir. */
export interface WriteContext {
  writer: Writer;
  backup: Backup;
  runner: ReturnType<typeof createRunner>;
}

async function applyTags(tags: Tag[], dstTagIds: Set<string>, { writer, backup, runner }: WriteContext) {
  if (!tags.length) return;
  runner.start('Tags', tags.length);
  for (const tag of tags) {
    await runner.run(`tag ${tag.sys.id}`, async () => {
      await writer.createTag(tag);
      dstTagIds.add(tag.sys.id);
      backup.recordCreated('tags', tag.sys.id);
    });
  }
  runner.end();
}

/**
 * Crea content types, agrega campos y copia la apariencia del editor de los campos que
 * correspondan. Actualiza `dstCTs` con las versiones nuevas. `srcEditors` lee la apariencia
 * de origen (solo se llama si hay apariencias que copiar).
 */
export async function applyModelChanges(
  { contentTypesToCreate, fieldsToAdd, editorFields }: ModelChanges,
  dstCTs: Map<string, ContentType>,
  srcEditors: () => Promise<Map<string, EditorInterface>>,
  ctx: WriteContext,
) {
  const { writer, backup, runner } = ctx;
  const total = contentTypesToCreate.length + fieldsToAdd.size;
  if (total) await applyStructure(contentTypesToCreate, fieldsToAdd, dstCTs, ctx);
  if (!editorFields.size) return;

  const editors = await srcEditors();
  runner.start('Apariencia del editor', editorFields.size);
  for (const [ctId, ids] of editorFields) {
    await runner.run(`${ctId}: ${ids.size} campo(s)`, async () => {
      const src = editors.get(ctId);
      if (!src) throw new Error(`no encontré la apariencia de "${ctId}" en origen`);
      await writer.updateEditorInterface(ctId, (current) => ({
        ...current,
        controls: mergeControls(current.controls, src.controls, ids),
      }));
      backup.recordEditor(ctId, [...ids]);
    });
  }
  runner.end();
}

async function applyStructure(
  contentTypesToCreate: ContentType[],
  fieldsToAdd: Map<string, Field[]>,
  dstCTs: Map<string, ContentType>,
  { writer, backup, runner }: WriteContext,
) {
  runner.start('Modelo', contentTypesToCreate.length + fieldsToAdd.size);
  for (const ct of contentTypesToCreate) {
    await runner.run(`content type ${ct.sys.id} creado`, async () => {
      dstCTs.set(ct.sys.id, await writer.createContentType(ct));
      backup.recordCreated('contentTypes', ct.sys.id);
    });
  }
  for (const [ctId, fields] of fieldsToAdd) {
    await runner.run(`${ctId}: +${fields.map((f) => f.id).join(', ')}`, async () => {
      const current = dstCTs.get(ctId);
      if (!current) throw new Error(`el content type "${ctId}" no existe en ${writer.environment}`);
      dstCTs.set(ctId, await writer.addFields(current, fields));
      backup.recordFields(
        ctId,
        fields.map((f) => f.id),
      );
    });
  }
  runner.end();
}

export async function applyAssets(assets: Asset[], dstLocales: Locales, { writer, backup, runner }: WriteContext) {
  if (!assets.length) return;
  runner.start('Imágenes', assets.length);
  for (const asset of assets) {
    await runner.run(`asset ${asset.sys.id} creado (draft)`, async () => {
      await writer.createAsset(asset.sys.id, assetFieldsForDestination(asset, dstLocales));
      backup.recordCreated('assets', asset.sys.id);
    });
  }
  runner.end();
}

/** Migrar entries: todas las fases en orden. Devuelve los fallos. */
export async function executePlan(
  plan: Plan,
  analysis: Analysis,
  srcEditors: () => Promise<Map<string, EditorInterface>>,
  ctx: WriteContext,
): Promise<string[]> {
  const { titleOf, locales, diffs } = analysis;
  const { writer, backup, runner } = ctx;
  const dstCTs = new Map(analysis.contentTypes.dst); // se actualiza con los cambios de modelo
  const dstTagIds = new Set(analysis.tags.dstIds);

  await applyTags(plan.tagsToCreate, dstTagIds, ctx);
  await applyModelChanges(plan, dstCTs, srcEditors, ctx);
  await applyAssets(plan.assetsToCreate, locales.dst, ctx);

  runner.start('Entries', plan.entries.length);
  for (const { id, action, entry } of plan.entries) {
    const ctId = contentTypeOf(entry);
    const title = titleOf(entry);
    const label = `${title} ${pc.dim(id)}`;
    const dstCT = dstCTs.get(ctId);
    if (!dstCT) {
      runner.fail(label, `el content type "${ctId}" no se pudo crear en ${writer.environment}`);
      continue;
    }

    // Solo campos que existen en ambos modelos con el mismo tipo; el resto conserva su valor.
    const writable = writableFields(dstCT, diffs.get(ctId));
    const fields = fieldsForDestination(entry, writable, locales.dst);
    const tags = (entry.metadata?.tags ?? []).filter((t) => dstTagIds.has(t.sys.id));

    if (action === ACTION.UPDATE) {
      await runner.run(`${label} actualizada ${pc.dim('(queda Changed si estaba publicada)')}`, async () => {
        await writer.updateEntry(
          id,
          (current) => mergeWithExisting(current, fields, writable, locales.src),
          tags,
          (current) => backup.recordUpdate(current, title),
        );
        backup.confirmUpdate(id);
      });
    } else {
      await runner.run(`${label} creada (draft)`, async () => {
        await writer.createEntry(id, ctId, fields, tags);
        backup.recordCreated('entries', id);
      });
    }
  }
  runner.end();
  return runner.failures;
}

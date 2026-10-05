/**
 * Único módulo que escribe en Contentful.
 *
 * - Todo va al ambiente destino, que queda fijo al crear el writer: no hay forma de
 *   escribir en el origen.
 * - Solo crea y actualiza. No existe delete, archive ni unpublish.
 * - Lo único que publica son content types, porque Contentful lo exige para usar
 *   campos nuevos. Entries y assets quedan en draft.
 */
export function createWriter(cma, { src, dst }) {
  if (!dst || dst === src) throw new Error(`Ambiente destino inválido: "${dst}"`);
  const env = { environmentId: dst };
  const publishContentType = (ct) => cma.contentType.publish({ ...env, contentTypeId: ct.sys.id }, ct);

  return {
    environment: dst,

    createTag: (tag) =>
      cma.tag.createWithId(
        { ...env, tagId: tag.sys.id },
        { name: tag.name, sys: { visibility: tag.sys.visibility ?? 'private' } },
      ),

    /** Crea el content type con el mismo ID y campos que en origen. Devuelve la versión publicada. */
    async createContentType(srcCT) {
      const { name, description, displayField, fields } = srcCT;
      const ct = await cma.contentType.createWithId(
        { ...env, contentTypeId: srcCT.sys.id },
        { name, description, displayField, fields },
      );
      return publishContentType(ct);
    },

    /** Agrega campos al final del content type de destino, sin tocar los existentes. */
    async addFields(dstCT, fields) {
      const ct = await cma.contentType.update(
        { ...env, contentTypeId: dstCT.sys.id },
        { ...dstCT, fields: [...dstCT.fields, ...fields] },
      );
      return publishContentType(ct);
    },

    async createAsset(id, fields) {
      const asset = await cma.asset.createWithId({ ...env, assetId: id }, { fields });
      await cma.asset.processForAllLocales(env, asset);
    },

    createEntry: (id, contentTypeId, fields, tags) =>
      cma.entry.createWithId({ ...env, entryId: id, contentTypeId }, { fields, metadata: { tags } }),

    /** Lee la versión actual en destino y la actualiza con `buildFields(camposActuales)`. */
    async updateEntry(id, buildFields, tags) {
      const current = await cma.entry.get({ ...env, entryId: id });
      return cma.entry.update(
        { ...env, entryId: id },
        { ...current, fields: buildFields(current.fields ?? {}), metadata: { ...(current.metadata ?? {}), tags } },
      );
    },
  };
}

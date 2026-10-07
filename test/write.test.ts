import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createWriter } from '../src/contentful/write.ts';
import { asset, contentType, entry, fakeCma, field, tag } from './fixtures.ts';

describe('createWriter', () => {
  test('no se puede crear apuntando al mismo ambiente de origen ni sin destino', () => {
    const { cma } = fakeCma();
    assert.throws(() => createWriter(cma, { src: 'develop', dst: 'develop' }));
    assert.throws(() => createWriter(cma, { src: 'develop', dst: '' }));
  });

  test('todas sus llamadas van al ambiente destino y ninguna borra, archiva ni despublica', async () => {
    const { cma, calls } = fakeCma([entry('e1', 'banner', { title: { 'es-CO': 'Viejo' } })]);
    const writer = createWriter(cma, { src: 'develop', dst: 'qa' });

    await writer.createTag(tag('navidad'));
    await writer.createContentType(contentType('promo', [field('title')]));
    await writer.addFields(contentType('banner', [field('title')]), [field('subtitle')]);
    await writer.createAsset('img1', asset('img1', { 'es-CO': { url: '//images.ctfassets.net/a.jpg' } }).fields);
    await writer.createEntry('e2', 'banner', { title: { 'es-CO': 'Nuevo' } }, []);
    await writer.updateEntry('e1', (current) => ({ ...current, title: { 'es-CO': 'Nuevo' } }), []);
    await writer.updateEditorInterface('banner', (current) => current);

    assert.ok(calls.length > 0);
    assert.ok(calls.some((c) => c.method === 'editorInterface.update'));
    for (const call of calls) {
      assert.equal(call.params.environmentId, 'qa', `${call.method} no fue a qa`);
      assert.doesNotMatch(call.method, /delete|archive|unpublish/i);
    }
  });

  test('al actualizar parte de la versión actual en destino y aplica los campos nuevos', async () => {
    const { cma, calls } = fakeCma([entry('e1', 'banner', { title: { 'es-CO': 'Viejo' } })]);
    const writer = createWriter(cma, { src: 'develop', dst: 'qa' });

    await writer.updateEntry('e1', (current) => ({ ...current, title: { 'es-CO': 'Nuevo' } }), []);

    const update = calls.find((c) => c.method === 'entry.update');
    assert.ok(update);
    assert.deepEqual((update.data as { fields: unknown }).fields, { title: { 'es-CO': 'Nuevo' } });
    assert.ok(calls.findIndex((c) => c.method === 'entry.get') < calls.indexOf(update));
  });

  test('respalda la versión actual antes de actualizar; si el respaldo falla, no actualiza', async () => {
    const { cma, calls } = fakeCma([entry('e1', 'banner', { title: { 'es-CO': 'Viejo' } })]);
    const writer = createWriter(cma, { src: 'develop', dst: 'qa' });

    const seen: unknown[] = [];
    await writer.updateEntry(
      'e1',
      (current) => current,
      [],
      (current) => {
        seen.push(current.fields);
        assert.equal(calls.filter((c) => c.method === 'entry.update').length, 0, 'todavía no actualizó');
      },
    );
    assert.deepEqual(seen, [{ title: { 'es-CO': 'Viejo' } }]);

    const before = calls.length;
    await assert.rejects(
      writer.updateEntry(
        'e1',
        (current) => current,
        [],
        () => {
          throw new Error('disco lleno');
        },
      ),
    );
    assert.equal(
      calls.slice(before).some((c) => c.method === 'entry.update'),
      false,
    );
  });

  test('solo publica content types', async () => {
    const { cma, calls } = fakeCma([entry('e1', 'banner')]);
    const writer = createWriter(cma, { src: 'develop', dst: 'qa' });
    await writer.createAsset('img1', asset('img1', { 'es-CO': { url: '//images.ctfassets.net/a.jpg' } }).fields);
    await writer.createEntry('e2', 'banner', {}, []);
    await writer.updateEntry('e1', (current) => current, []);
    await writer.createContentType(contentType('promo', [field('title')]));

    const published = calls.filter((c) => c.method.endsWith('.publish')).map((c) => c.method);
    assert.deepEqual(published, ['contentType.publish']);
  });
});

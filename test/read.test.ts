import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readEntryTree } from '../src/contentful/read.ts';
import { AbortError } from '../src/errors.ts';
import { entry, fakeCma, link } from './fixtures.ts';

describe('readEntryTree', () => {
  test('lee el árbol completo por niveles y marca los links rotos', async () => {
    const { cma, calls } = fakeCma([
      entry('banner', 'banner', { store: { 'es-CO': link('store') }, roto: { 'es-CO': link('no-existe') } }),
      entry('store', 'store', { municipio: { 'es-CO': link('municipio') } }),
      entry('municipio', 'municipio'),
    ]);

    const tree = await readEntryTree(cma, 'develop', ['banner']);

    assert.deepEqual([...tree.entries.keys()], ['banner', 'store', 'municipio']);
    assert.deepEqual(tree.children.get('banner'), ['store', 'no-existe']);
    assert.deepEqual([...tree.broken], ['no-existe']);
    assert.equal(calls.filter((c) => c.method === 'entry.getMany').length, 3, 'una llamada por nivel');
    assert.ok(calls.every((c) => c.params.environmentId === 'develop'));
  });

  test('si una entry que pegaste no existe, se detiene', async () => {
    const { cma } = fakeCma([]);
    await assert.rejects(readEntryTree(cma, 'develop', ['no-existe']), AbortError);
  });

  test('los ciclos no se quedan en un loop', async () => {
    const { cma } = fakeCma([
      entry('a', 'x', { b: { 'es-CO': link('b') } }),
      entry('b', 'x', { a: { 'es-CO': link('a') } }),
    ]);
    const tree = await readEntryTree(cma, 'develop', ['a']);
    assert.deepEqual([...tree.entries.keys()], ['a', 'b']);
  });
});

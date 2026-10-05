import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { assetIdsOf, childEntryIds, collectLinks, makeTitleOf } from '../src/core/entries.ts';
import { contentType, entry, field, link } from './fixtures.ts';

describe('collectLinks', () => {
  test('encuentra links dentro de rich text', () => {
    const richText = {
      nodeType: 'document',
      content: [
        { nodeType: 'embedded-entry-block', data: { target: link('e1') } },
        { nodeType: 'paragraph', content: [{ data: { target: link('a1', 'Asset') } }] },
      ],
    };
    assert.deepEqual(collectLinks(richText), [
      { type: 'Entry', id: 'e1' },
      { type: 'Asset', id: 'a1' },
    ]);
  });

  test('ignora objetos con sys que no son links', () => {
    assert.deepEqual(collectLinks({ sys: { type: 'Entry', id: 'x' } }), []);
  });
});

describe('childEntryIds / assetIdsOf', () => {
  const e = entry('e', 'banner', {
    a: { 'es-CO': link('x') },
    b: { 'es-CO': [link('x'), link('y')] },
    img: { 'es-CO': link('i1', 'Asset') },
  });

  test('hijos sin repetidos', () => {
    assert.deepEqual(childEntryIds(e), ['x', 'y']);
  });

  test('imágenes', () => {
    assert.deepEqual(assetIdsOf(e), ['i1']);
  });
});

describe('makeTitleOf', () => {
  const titleOf = makeTitleOf(new Map([['banner', contentType('banner', [field('title')])]]), 'es-CO');

  test('usa el displayField en el locale por defecto', () => {
    assert.equal(titleOf(entry('e', 'banner', { title: { 'es-CO': 'Hola', 'en-US': 'Hi' } })), 'Hola');
  });

  test('si no hay valor en ese locale, usa el primero que encuentre', () => {
    assert.equal(titleOf(entry('e', 'banner', { title: { 'en-US': 'Hi' } })), 'Hi');
  });

  test('sin título legible devuelve un texto fijo', () => {
    assert.equal(titleOf(entry('e', 'banner')), '(sin título)');
    assert.equal(titleOf(entry('e', 'banner', { title: { 'es-CO': 42 } })), '(sin título)');
    assert.equal(titleOf(entry('e', 'desconocido', { title: { 'es-CO': 'x' } })), '(sin título)');
  });
});

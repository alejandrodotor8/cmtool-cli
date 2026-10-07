import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { compareEntryFields, migrationChanges, summarizeValue, VALUE } from '../src/core/entry-compare.ts';
import { contentType, entry, field, link } from './fixtures.ts';

describe('compareEntryFields', () => {
  const ct = contentType('banner', [field('title'), field('cta'), field('image', 'Link'), field('legal')]);
  const src = entry('b', 'banner', {
    title: { 'es-CO': 'Hola' },
    cta: { 'es-CO': 'Ver más' },
    image: { 'es-CO': link('img1', 'Asset') },
  });
  const dst = entry('b', 'banner', {
    title: { 'es-CO': 'Hola' },
    cta: { 'es-CO': 'Comprar' },
    legal: { 'es-CO': 'Términos' },
  });

  test('clasifica cada campo en el orden del modelo y omite los vacíos en ambos', () => {
    assert.deepEqual(
      compareEntryFields(src, dst, ct).map((f) => [f.id, f.status]),
      [
        ['title', VALUE.SAME],
        ['cta', VALUE.DIFFERENT],
        ['image', VALUE.ONLY_SRC],
        ['legal', VALUE.ONLY_DST],
      ],
    );
  });

  test('usa los nombres del modelo de origen', () => {
    assert.equal(
      compareEntryFields(src, dst, contentType('banner', [field('title', 'Symbol', { name: 'Título' })]))[0]?.name,
      'Título',
    );
  });

  test('los campos que no están en el modelo van al final', () => {
    const fields = compareEntryFields(entry('b', 'banner', { extra: { 'es-CO': 1 } }), entry('b', 'banner'), ct);
    assert.deepEqual(
      fields.map((f) => f.id),
      ['extra'],
    );
  });
});

describe('summarizeValue', () => {
  test('texto, números, links, listas y rich text', () => {
    assert.equal(summarizeValue({ 'es-CO': 'Hola' }), 'Hola');
    assert.equal(summarizeValue({ 'es-CO': 'Hola', 'en-US': 'Hi' }), 'Hola (+1 idiomas)');
    assert.equal(summarizeValue({ 'es-CO': 3 }), '3');
    assert.equal(summarizeValue({ 'es-CO': link('img1', 'Asset') }), '→ img1');
    assert.equal(summarizeValue({ 'es-CO': [link('a'), link('b')] }), '[2] → a, → b');
    assert.equal(
      summarizeValue({
        'es-CO': { nodeType: 'document', content: [{ nodeType: 'paragraph', content: [{ value: 'Texto largo' }] }] },
      }),
      'rich text: Texto largo',
    );
    assert.equal(summarizeValue(undefined), '—');
  });

  test('recorta textos largos', () => {
    assert.equal(summarizeValue('a'.repeat(100), 10), `${'a'.repeat(9)}…`);
  });
});

describe('migrationChanges', () => {
  const ct = contentType('banner', [field('title', 'Symbol', { localized: true }), field('cta')]);

  test('solo cuenta lo que la migración cambiaría: campos del modelo de origen, en sus idiomas', () => {
    const src = entry('b', 'banner', { title: { 'es-CO': 'Hola' }, cta: { 'es-CO': 'Ver' } });
    const dst = entry('b', 'banner', {
      title: { 'es-CO': 'Hola', 'pt-BR': 'Olá' },
      cta: { 'es-CO': 'Comprar' },
      soloDestino: { 'es-CO': 'x' },
    });
    assert.deepEqual(
      migrationChanges(src, dst, ct, new Set(['es-CO'])).map((f) => f.id),
      ['cta'],
    );
  });

  test('sin cambios, lista vacía', () => {
    const same = entry('b', 'banner', { title: { 'es-CO': 'Hola' } });
    assert.deepEqual(migrationChanges(same, same, ct, new Set(['es-CO'])), []);
  });

  test('un campo vaciado en origen cuenta como cambio', () => {
    const src = entry('b', 'banner', {});
    const dst = entry('b', 'banner', { cta: { 'es-CO': 'Comprar' } });
    assert.deepEqual(
      migrationChanges(src, dst, ct, new Set(['es-CO'])).map((f) => [f.id, f.status]),
      [['cta', VALUE.ONLY_DST]],
    );
  });
});

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { diffContentType, FIELD, fieldType } from '../src/core/model.ts';
import { contentType, field } from './fixtures.ts';

describe('diffContentType', () => {
  const src = contentType('banner', [
    field('a'),
    field('b', 'Link', { linkType: 'Entry' }),
    field('c', 'Array', { items: { type: 'Link', linkType: 'Entry' } }),
  ]);
  const dst = contentType('banner', [field('a'), field('b', 'Link', { linkType: 'Asset' }), field('d')]);
  const diff = diffContentType(src, dst);

  test('clasifica cada campo y sigue el orden de origen, con los que sobran al final', () => {
    assert.deepEqual(
      diff.rows.map((r) => [r.field.id, r.status]),
      [
        ['a', FIELD.OK],
        ['b', FIELD.MISMATCH],
        ['c', FIELD.MISSING],
        ['d', FIELD.EXTRA],
      ],
    );
  });

  test('separa faltantes, sobrantes y de otro tipo', () => {
    assert.equal(diff.missingCT, false);
    assert.deepEqual(
      diff.missing.map((f) => f.id),
      ['c'],
    );
    assert.deepEqual(
      diff.extra.map((f) => f.id),
      ['d'],
    );
    assert.deepEqual(
      diff.mismatched.map((f) => f.id),
      ['b'],
    );
  });

  test('si el content type no existe en destino, todos sus campos faltan', () => {
    const missing = diffContentType(src, undefined);
    assert.equal(missing.missingCT, true);
    assert.ok(missing.rows.every((r) => r.status === FIELD.MISSING));
  });
});

describe('fieldType', () => {
  test('describe links y arrays', () => {
    assert.equal(fieldType(field('a')), 'Symbol');
    assert.equal(fieldType(field('b', 'Link', { linkType: 'Asset' })), 'Link Asset');
    assert.equal(fieldType(field('c', 'Array', { items: { type: 'Link', linkType: 'Entry' } })), 'Array<Entry>');
    assert.equal(fieldType(field('d', 'Array', { items: { type: 'Symbol' } })), 'Array<Symbol>');
  });
});

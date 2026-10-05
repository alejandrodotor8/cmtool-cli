import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { compareRules, diffContentType, FIELD, fieldType } from '../src/core/model.ts';
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

describe('compareRules', () => {
  test('campos iguales no tienen diferencias', () => {
    assert.equal(compareRules(field('a'), field('a')), undefined);
  });

  test('obligatorio solo en destino', () => {
    assert.equal(compareRules(field('a'), field('a', 'Symbol', { required: true }))?.requiredOnlyInDst, true);
    assert.equal(compareRules(field('a', 'Symbol', { required: true }), field('a')), undefined, 'al revés no afecta');
  });

  test('localizado en origen pero no en destino', () => {
    assert.equal(compareRules(field('a', 'Symbol', { localized: true }), field('a'))?.localizationLost, true);
    assert.equal(compareRules(field('a'), field('a', 'Symbol', { localized: true })), undefined, 'al revés no afecta');
  });

  test('validaciones distintas, incluidas las de los items de un Array', () => {
    const src = field('a', 'Array', {
      items: { type: 'Link', linkType: 'Entry', validations: [{ linkContentType: ['slide'] }] },
      validations: [{ size: { max: 5 } }],
    });
    const dst = field('a', 'Array', {
      items: { type: 'Link', linkType: 'Entry', validations: [{ linkContentType: ['slide', 'promo'] }] },
      validations: [{ size: { max: 5 } }],
    });
    assert.deepEqual(compareRules(src, dst)?.validations, ['items.linkContentType']);
  });

  test('ignora el orden de las listas y los mensajes de error', () => {
    const src = field('a', 'Symbol', { validations: [{ in: ['x', 'y'], message: 'uno' }] });
    const dst = field('a', 'Symbol', { validations: [{ in: ['y', 'x'], message: 'otro' }] });
    assert.equal(compareRules(src, dst), undefined);
  });

  test('una validación que solo existe en un lado cuenta como diferencia', () => {
    const dst = field('a', 'Symbol', { validations: [{ unique: true }] });
    assert.deepEqual(compareRules(field('a'), dst)?.validations, ['unique']);
  });
});

describe('diffContentType con reglas', () => {
  test('mismo tipo con reglas distintas queda como RULES, no como al día', () => {
    const diff = diffContentType(
      contentType('banner', [field('title')]),
      contentType('banner', [field('title', 'Symbol', { required: true })]),
    );
    assert.equal(diff.rows[0]?.status, FIELD.RULES);
    assert.deepEqual(
      diff.changedRules.map((f) => f.id),
      ['title'],
    );
  });
});

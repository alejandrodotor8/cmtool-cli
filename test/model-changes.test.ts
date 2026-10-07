import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { diffContentType } from '../src/core/model.ts';
import {
  countEditorFields,
  countNewFields,
  hasModelChanges,
  modelChangesFrom,
  modelOptions,
  notAddedFields,
} from '../src/core/model-changes.ts';
import { contentType, field } from './fixtures.ts';

const subtitle = field('subtitle');
const cta = field('cta');
const banner = diffContentType(
  contentType('banner', [field('title'), subtitle, cta]),
  contentType('banner', [field('title')]),
);
const promoCT = contentType('promo', [field('title')]);
const promo = diffContentType(promoCT, undefined);
const slide = diffContentType(contentType('slide', [field('title')]), contentType('slide', [field('title')]));

describe('modelOptions', () => {
  test('sin entries de por medio (migrar modelo): ofrece lo que falta, nada más', () => {
    assert.deepEqual(
      modelOptions([banner, promo, slide]).map((o) => [o.diff.id, o.onlyReused]),
      [
        ['banner', false],
        ['promo', false],
      ],
    );
  });

  test('con entries: un content type que falta solo se ofrece si se escribe alguna entry suya', () => {
    const options = modelOptions([banner, promo], new Set(['banner']));
    assert.deepEqual(
      options.map((o) => o.diff.id),
      ['banner'],
    );
  });

  test('marca los campos de content types que solo usan entries reutilizadas', () => {
    assert.equal(modelOptions([banner], new Set())[0]?.onlyReused, true);
  });
});

describe('modelChangesFrom y notAddedFields', () => {
  const changes = modelChangesFrom(
    [{ ctId: 'banner', field: subtitle }, { ctId: 'promo' }],
    new Map([['promo', promoCT]]),
  );

  test('agrupa campos por content type y arma los content types a crear', () => {
    assert.deepEqual(
      changes.fieldsToAdd.get('banner')?.map((f) => f.id),
      ['subtitle'],
    );
    assert.deepEqual(
      changes.contentTypesToCreate.map((ct) => ct.sys.id),
      ['promo'],
    );
    assert.equal(countNewFields(changes), 1);
    assert.equal(hasModelChanges(changes), true);
  });

  test('lista los campos que faltan y no se marcaron', () => {
    assert.deepEqual(notAddedFields([banner, promo], changes.fieldsToAdd), ['banner.cta']);
  });

  test('sin nada marcado, no hay cambios', () => {
    assert.equal(hasModelChanges(modelChangesFrom([], new Map())), false);
  });
});

describe('apariencia del editor en los cambios de modelo', () => {
  test('al crear un content type o agregar campos, se copia su apariencia', () => {
    const changes = modelChangesFrom(
      [{ ctId: 'banner', field: subtitle }, { ctId: 'promo' }],
      new Map([['promo', promoCT]]),
    );
    assert.deepEqual(
      [...changes.editorFields].map(([ct, ids]) => [ct, [...ids]]),
      [
        ['banner', ['subtitle']],
        ['promo', ['title']],
      ],
    );
  });

  test('"copiar apariencia" usa los campos que difieren y no crea el content type', () => {
    const changes = modelChangesFrom([{ ctId: 'slide', editor: true }], new Map(), new Map([['slide', ['title']]]));
    assert.deepEqual(changes.contentTypesToCreate, []);
    assert.deepEqual([...(changes.editorFields.get('slide') ?? [])], ['title']);
    assert.equal(countEditorFields(changes), 1);
    assert.equal(hasModelChanges(changes), true);
  });

  test('ofrece content types que solo difieren en apariencia', () => {
    const options = modelOptions([slide], undefined, new Map([['slide', ['title']]]));
    assert.deepEqual(
      options.map((o) => [o.diff.id, o.editorFields]),
      [['slide', ['title']]],
    );
  });
});

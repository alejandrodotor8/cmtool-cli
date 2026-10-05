import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseEntryIds } from '../src/core/ids.ts';

describe('parseEntryIds', () => {
  test('separa por coma, espacio o salto de línea', () => {
    assert.deepEqual(parseEntryIds('abc, def ghi\njkl'), ['abc', 'def', 'ghi', 'jkl']);
  });

  test('extrae el ID de una URL de Contentful', () => {
    const url =
      'https://app.contentful.com/spaces/s1/environments/develop/entries/5NIY0nRGNkKvvjO8yc8Pp1?focusedField=x';
    assert.deepEqual(parseEntryIds(url), ['5NIY0nRGNkKvvjO8yc8Pp1']);
    assert.deepEqual(parseEntryIds('https://app.contentful.com/spaces/s1/entries/abc/'), ['abc']);
  });

  test('quita repetidos y vacíos', () => {
    assert.deepEqual(parseEntryIds('a a,a'), ['a']);
    assert.deepEqual(parseEntryIds('  ,  '), []);
  });
});

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { SavedEntry } from '../src/backup.ts';
import type { Entry } from '../src/contentful/types.ts';
import { RESTORE, restoreStatus } from '../src/core/restore.ts';
import { entry } from './fixtures.ts';

const saved: SavedEntry = { id: 'banner', contentType: 'banner', title: 'Banner', version: 7, fields: {}, tags: [] };

const withVersion = (version: number): Entry => {
  const e = entry('banner', 'banner');
  (e.sys as Entry['sys']).version = version;
  return e;
};

describe('restoreStatus', () => {
  test('si nadie la tocó después de migrar (versión + 1), se restaura', () => {
    assert.equal(restoreStatus(saved, withVersion(8)), RESTORE.RESTORE);
  });

  test('si alguien la editó o publicó después, se avisa', () => {
    assert.equal(restoreStatus(saved, withVersion(9)), RESTORE.CHANGED);
    assert.equal(restoreStatus(saved, withVersion(12)), RESTORE.CHANGED);
  });

  test('si ya no existe en destino, se omite', () => {
    assert.equal(restoreStatus(saved, undefined), RESTORE.MISSING);
  });
});

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { reportName } from '../src/report/save.ts';

describe('reportes guardados', () => {
  test('nombre de archivo por defecto', () => {
    assert.equal(
      reportName('modelos', 'develop', 'qa', new Date('2026-10-07T12:00:00Z')),
      'modelos-develop-vs-qa-2026-10-07.md',
    );
  });
});

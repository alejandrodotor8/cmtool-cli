import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { CancelError, isCancel } from '../src/errors.ts';

describe('isCancel', () => {
  test('reconoce la cancelación de una pregunta (Ctrl+C o Esc)', () => {
    assert.equal(isCancel(new CancelError()), true);
    assert.equal(isCancel(new Error('otro')), false);
  });
});

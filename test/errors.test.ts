import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { formatError, isCancel } from '../src/errors.ts';

describe('formatError', () => {
  test('muestra status, mensaje y detalles, pero nunca la request con el token', () => {
    const body = {
      status: 422,
      statusText: 'Unprocessable Entity',
      message: 'Validation error',
      details: { errors: [{ name: 'required', path: ['fields', 'title'] }] },
      request: { headers: { Authorization: 'Bearer SECRETO123' } },
    };
    const msg = formatError(new Error(JSON.stringify(body)));
    assert.equal(msg, '422 Unprocessable Entity: Validation error → required en fields.title');
    assert.equal(msg.includes('SECRETO123'), false);
  });

  test('un error que no es del CMA se muestra tal cual', () => {
    assert.equal(formatError(new Error('se cayó la red')), 'se cayó la red');
    assert.equal(formatError('texto'), 'texto');
  });
});

describe('isCancel', () => {
  test('reconoce el Ctrl+C de los prompts', () => {
    const e = new Error('cancel');
    e.name = 'ExitPromptError';
    assert.equal(isCancel(e), true);
    assert.equal(isCancel(new Error('otro')), false);
  });
});

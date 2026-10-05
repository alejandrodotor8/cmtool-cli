import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { describeRequest } from '../src/contentful/client.ts';

describe('describeRequest', () => {
  test('muestra método, ruta y parámetros', () => {
    assert.equal(
      describeRequest({
        method: 'get',
        url: '/spaces/s1/environments/qa/entries',
        params: { 'sys.id[in]': 'a,b', limit: 2 },
      }),
      'GET /spaces/s1/environments/qa/entries?sys.id[in]=a,b&limit=2',
    );
  });

  test('nunca muestra los headers, que llevan el token', () => {
    const request = {
      method: 'put',
      url: '/spaces/s1/environments/qa/entries/e1',
      headers: { Authorization: 'Bearer SECRETO123' },
    };
    const text = describeRequest(request);
    assert.equal(text, 'PUT /spaces/s1/environments/qa/entries/e1');
    assert.equal(text.includes('SECRETO123'), false);
  });
});

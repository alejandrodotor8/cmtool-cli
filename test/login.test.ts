import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { tokenHost } from '../src/commands/login.ts';
import { CMA_HOST_NAMES } from '../src/session.ts';

const USER = { id: 'u1', email: 'ana@example.com' };
const rejected = (status: number) => new Error(JSON.stringify({ status, statusText: 'x', message: 'x' }));

/** Un Contentful falso: responde por host y registra a qué hosts se mandó el token. */
function fakeHosts(answers: Record<string, number | 'ok'>) {
  const asked: string[] = [];
  return {
    asked,
    userIn: async (host: string) => {
      asked.push(host);
      const answer = answers[host];
      if (answer === 'ok') return USER;
      throw rejected(answer ?? 401);
    },
  };
}

describe('tokenHost', () => {
  test('un token normal funciona en el primer host y no se prueba en otro', async () => {
    const { asked, userIn } = fakeHosts({ 'api.contentful.com': 'ok' });
    assert.deepEqual(await tokenHost(userIn), { host: 'api.contentful.com', user: USER });
    assert.deepEqual(asked, ['api.contentful.com']);
  });

  test('un token de la región EU se reconoce y se guarda con su host', async () => {
    const { userIn } = fakeHosts({ 'api.contentful.com': 401, 'api.eu.contentful.com': 'ok' });
    assert.equal((await tokenHost(userIn))?.host, 'api.eu.contentful.com');
  });

  test('si ninguno lo acepta, no hay host; y solo se probó en hosts de Contentful', async () => {
    const { asked, userIn } = fakeHosts({});
    assert.equal(await tokenHost(userIn), undefined);
    assert.deepEqual(asked, CMA_HOST_NAMES);
  });

  test('un error que no es 401 (sin red, Contentful caído) se informa y no se prueba otro host', async () => {
    const { asked, userIn } = fakeHosts({ 'api.contentful.com': 500 });
    await assert.rejects(tokenHost(userIn), /500/);
    assert.deepEqual(asked, ['api.contentful.com']);
  });
});

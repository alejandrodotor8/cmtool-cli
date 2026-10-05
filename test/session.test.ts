import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { AbortError } from '../src/errors.ts';
import { loadSession } from '../src/session.ts';

describe('loadSession', () => {
  const saved = { ...process.env };
  let dir: string;

  /** Deja una sesión de prueba como si fuera el `.contentfulrc.json` del usuario. */
  const useConfig = (config: object) => {
    const file = path.join(dir, '.contentfulrc.json');
    fs.writeFileSync(file, JSON.stringify(config));
    process.env.CONTENTFUL_CONFIG_FILE = file;
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctf-migrate-'));
    delete process.env.CONTENTFUL_MANAGEMENT_TOKEN;
  });

  afterEach(() => {
    process.env = { ...saved };
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('usa el host por defecto de Contentful', () => {
    useConfig({ managementToken: 't' });
    const session = loadSession();
    assert.equal(session.host, 'api.contentful.com');
    assert.equal(session.appHost, 'app.contentful.com');
  });

  test('acepta la región EU', () => {
    useConfig({ managementToken: 't', host: 'api.eu.contentful.com' });
    assert.equal(loadSession().appHost, 'app.eu.contentful.com');
  });

  test('la variable de entorno tiene prioridad sobre el archivo', () => {
    useConfig({ managementToken: 'del-archivo' });
    process.env.CONTENTFUL_MANAGEMENT_TOKEN = 'del-env';
    assert.equal(loadSession().token, 'del-env');
  });

  for (const host of ['evil.example.com', 'api.contentful.com.evil.com', 'constructor', '__proto__']) {
    test(`no envía el token a un host que no es de Contentful: ${host}`, () => {
      useConfig({ managementToken: 't', host });
      assert.throws(() => loadSession(), AbortError);
    });
  }

  test('sin token se detiene', () => {
    useConfig({});
    assert.throws(() => loadSession(), AbortError);
  });
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { AbortError } from 'cmtool-core';
import {
  forgetToken,
  hasSession,
  loadSession,
  looksLikeToken,
  savedTokenFile,
  saveToken,
  sessionFile,
} from '../src/session.ts';

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
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfm-'));
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

describe('saveToken', () => {
  const TOKEN = `CFPAT-${'a'.repeat(43)}`;
  const saved = { ...process.env };
  const cwd = process.cwd();
  let dir: string;
  const home = () => path.join(os.homedir(), '.contentfulrc.json');
  const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfm-'));
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(cwd);
    process.env = { ...saved };
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(home(), { force: true });
  });

  test('sin sesión, lo guarda en tu carpeta personal como contentful login, y queda como sesión', () => {
    assert.equal(hasSession(), false);
    assert.equal(saveToken(TOKEN, 'api.contentful.com'), home());
    assert.deepEqual(read(home()), { managementToken: TOKEN, host: 'api.contentful.com' });
    assert.ok(fs.readFileSync(home(), 'utf8').endsWith('}\n'));
    assert.equal(hasSession(), true);
    assert.equal(loadSession().token, TOKEN);
  });

  test('conserva lo demás del archivo (space activo, proxy…) y reemplaza el token anterior', () => {
    fs.writeFileSync(home(), JSON.stringify({ managementToken: 'viejo', activeSpaceId: 'abc', proxy: { host: 'p' } }));
    saveToken(TOKEN, 'api.eu.contentful.com');
    assert.deepEqual(read(home()), {
      managementToken: TOKEN,
      activeSpaceId: 'abc',
      proxy: { host: 'p' },
      host: 'api.eu.contentful.com',
    });
    assert.equal(loadSession().appHost, 'app.eu.contentful.com');
  });

  test('solo lo puede leer tu usuario', { skip: process.platform === 'win32' }, () => {
    fs.writeFileSync(home(), '{}', { mode: 0o644 });
    saveToken(TOKEN, 'api.contentful.com');
    assert.equal(fs.statSync(home()).mode & 0o777, 0o600);
  });

  test('usa el mismo archivo que contentful login: CONTENTFUL_CONFIG_FILE, o el de la carpeta actual hacia arriba', () => {
    const nested = path.join(dir, 'proyecto', 'sub');
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(dir, 'proyecto', '.contentfulrc.json'), '{}');
    process.chdir(nested);
    assert.equal(fs.realpathSync(sessionFile()), fs.realpathSync(path.join(dir, 'proyecto', '.contentfulrc.json')));

    process.env.CONTENTFUL_CONFIG_FILE = path.join(dir, 'otro.json');
    assert.equal(saveToken(TOKEN, 'api.contentful.com'), path.join(dir, 'otro.json'));
    assert.equal(read(path.join(dir, 'otro.json')).managementToken, TOKEN);
  });

  test('no pisa un archivo que no es JSON válido', () => {
    fs.writeFileSync(home(), 'no es json');
    assert.throws(() => saveToken(TOKEN, 'api.contentful.com'), AbortError);
    assert.equal(fs.readFileSync(home(), 'utf8'), 'no es json');
  });

  test('logout: quita solo el token (como contentful logout) y la próxima vez no hay sesión', () => {
    fs.writeFileSync(
      home(),
      JSON.stringify({ managementToken: TOKEN, activeSpaceId: 'abc', host: 'api.contentful.com' }),
    );
    assert.equal(savedTokenFile(), home());
    assert.equal(forgetToken(), home());
    assert.deepEqual(read(home()), { activeSpaceId: 'abc', host: 'api.contentful.com' });
    assert.equal(hasSession(), false);
    assert.equal(savedTokenFile(), undefined);
  });

  test('logout sin token guardado no toca nada; después se puede volver a entrar', () => {
    fs.writeFileSync(home(), '{"activeSpaceId":"abc"}');
    assert.equal(forgetToken(), undefined);
    assert.equal(fs.readFileSync(home(), 'utf8'), '{"activeSpaceId":"abc"}');
    saveToken(TOKEN, 'api.contentful.com');
    assert.equal(loadSession().token, TOKEN);
  });

  test('logout quita el token del archivo que se está usando (el de la carpeta), no de otro', () => {
    fs.writeFileSync(home(), JSON.stringify({ managementToken: 'de-home' }));
    fs.writeFileSync(path.join(dir, '.contentfulrc.json'), JSON.stringify({ managementToken: TOKEN }));
    assert.equal(fs.realpathSync(forgetToken() ?? ''), fs.realpathSync(path.join(dir, '.contentfulrc.json')));
    assert.equal(read(home()).managementToken, 'de-home');
  });

  test('nunca guarda un host que no es de Contentful', () => {
    assert.throws(() => saveToken(TOKEN, 'evil.example.com'), AbortError);
    assert.equal(fs.existsSync(home()), false);
  });
});

describe('looksLikeToken', () => {
  test('como valida el Contentful CLI: 43 a 64 letras, números, - o _', () => {
    assert.equal(looksLikeToken(`CFPAT-${'a'.repeat(43)}`), true);
    assert.equal(looksLikeToken(`  CFPAT-${'a'.repeat(43)}\n`), true);
    assert.equal(looksLikeToken('corto'), false);
    assert.equal(looksLikeToken(`CFPAT ${'a'.repeat(43)}`), false);
    assert.equal(looksLikeToken('a'.repeat(65)), false);
  });
});

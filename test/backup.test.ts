import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { type BackupData, listBackups, readBackup, startBackup } from '../src/backup.ts';
import type { Entry } from '../src/contentful/types.ts';
import { AbortError } from '../src/errors.ts';
import { entry } from './fixtures.ts';

const meta: Pick<BackupData, 'kind' | 'spaceId' | 'src' | 'dst' | 'rootIds'> = {
  kind: 'migrate',
  spaceId: 's1',
  src: 'develop',
  dst: 'qa',
  rootIds: ['banner'],
};

describe('backup', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctf-migrate-backup-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('crea el archivo apenas empieza, antes de cualquier cambio', () => {
    const backup = startBackup(meta, dir);
    const data = readBackup(backup.file);
    assert.equal(data.dst, 'qa');
    assert.deepEqual(data.updated, []);
  });

  test('el nombre del archivo no tiene ":" (válido en Windows)', () => {
    const backup = startBackup(meta, dir);
    assert.equal(path.basename(backup.file).includes(':'), false);
  });

  test('guarda en disco cada cambio, con lo necesario para restaurar', () => {
    const backup = startBackup(meta, dir);
    const current = entry('banner', 'banner', { title: { 'es-CO': 'Antes' } }, ['navidad']);
    (current.sys as Entry['sys']).version = 7;

    backup.recordUpdate(current, 'Banner');
    backup.recordCreated('entries', 'slide');
    backup.recordFields('banner', ['subtitle']);

    const data = readBackup(backup.file);
    assert.deepEqual(data.updated[0], {
      id: 'banner',
      contentType: 'banner',
      title: 'Banner',
      version: 7,
      fields: { title: { 'es-CO': 'Antes' } },
      tags: [{ sys: { type: 'Link', linkType: 'Tag', id: 'navidad' } }],
    });
    assert.deepEqual(data.created.entries, ['slide']);
    assert.deepEqual(data.fieldsAdded, { banner: ['subtitle'] });
  });

  test('solo el usuario puede leer el respaldo', { skip: process.platform === 'win32' }, () => {
    const backup = startBackup(meta, dir);
    assert.equal(fs.statSync(backup.file).mode & 0o777, 0o600);
  });

  test('lista del más reciente al más antiguo e ignora archivos inválidos', () => {
    const write = (name: string, createdAt: string) =>
      fs.writeFileSync(path.join(dir, name), JSON.stringify({ version: 1, createdAt, updated: [] }));
    write('viejo.json', '2026-01-01T00:00:00.000Z');
    write('nuevo.json', '2026-06-01T00:00:00.000Z');
    fs.writeFileSync(path.join(dir, 'roto.json'), '{no es json');
    fs.writeFileSync(path.join(dir, 'otro.txt'), 'x');

    assert.deepEqual(
      listBackups(dir).map((b) => path.basename(b.file)),
      ['nuevo.json', 'viejo.json'],
    );
  });

  test('si no hay carpeta de respaldos, la lista está vacía', () => {
    assert.deepEqual(listBackups(path.join(dir, 'no-existe')), []);
  });

  test('un respaldo ilegible se detiene con un mensaje claro', () => {
    const file = path.join(dir, 'roto.json');
    fs.writeFileSync(file, '{no es json');
    assert.throws(() => readBackup(file), AbortError);
  });
});

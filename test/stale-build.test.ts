import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { buildIsStale } from '../bin/stale-build.mjs';

describe('buildIsStale', () => {
  let dir: string;
  let src: string;
  let built: string;

  /** Cambia la fecha de modificación de un archivo (segundos desde 1970). */
  const touch = (file: string, seconds: number) => fs.utimesSync(file, seconds, seconds);

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfm-build-'));
    src = path.join(dir, 'src');
    fs.mkdirSync(path.join(src, 'core'), { recursive: true });
    fs.writeFileSync(path.join(src, 'main.ts'), '');
    fs.writeFileSync(path.join(src, 'core', 'plan.ts'), '');
    built = path.join(dir, 'cli.js');
    fs.writeFileSync(built, '');
    touch(path.join(src, 'main.ts'), 1000);
    touch(path.join(src, 'core', 'plan.ts'), 1000);
    touch(built, 2000);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('si el build es más nuevo que el código, está al día', () => {
    assert.equal(buildIsStale([src], built), false);
  });

  test('si un archivo (también en subcarpetas) cambió después del build, está viejo', () => {
    touch(path.join(src, 'core', 'plan.ts'), 3000);
    assert.equal(buildIsStale([src], built), true);
  });

  test('solo cuenta el código (.ts y .js)', () => {
    const notes = path.join(src, 'notas.md');
    fs.writeFileSync(notes, '');
    touch(notes, 3000);
    assert.equal(buildIsStale([src], built), false);
  });

  test('cuenta también el núcleo compilado: si se recompiló cmtool-core, el build está viejo', () => {
    const core = path.join(dir, 'cmtool-core-dist');
    fs.mkdirSync(core);
    fs.writeFileSync(path.join(core, 'index.js'), '');
    touch(path.join(core, 'index.js'), 3000);
    assert.equal(buildIsStale([src, core], built), true);
    assert.equal(buildIsStale([], built), false);
  });
});

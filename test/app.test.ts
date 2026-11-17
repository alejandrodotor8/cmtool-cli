import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { APP_NAME, VERSION } from '../src/app.ts';

test('APP_NAME es el comando de package.json (cfm) y VERSION, su versión', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf8'));
  assert.equal(APP_NAME, 'cfm');
  assert.equal(VERSION, pkg.version);
  assert.ok(pkg.bin[APP_NAME], 'package.json bin debe tener el comando');
  assert.ok(pkg.bin[`${APP_NAME}-dev`], 'y su versión -dev');
});

test('el núcleo se pide con versión exacta (o enlazado, antes de publicarlo), y solo para el build', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf8'));
  // El build lleva el núcleo dentro de dist/cli.js: quien instala cfm no lo descarga.
  assert.equal(pkg.dependencies['cmtool-core'], undefined);
  // Versión exacta (nunca un rango): se sabe qué núcleo va en cada versión de cfm.
  assert.match(pkg.devDependencies['cmtool-core'], /^(\d+\.\d+\.\d+|link:cmtool-core)$/);
});

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

test('el núcleo se pide de npm con versión exacta, y solo para el build', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf8'));
  // El build lleva el núcleo dentro de dist/cli.js: quien instala cfm no lo descarga.
  assert.equal(pkg.dependencies['cmtool-core'], undefined);
  // Versión exacta: se sabe qué núcleo va en cada versión de cfm. Ni un rango ni link:
  // (bun link --save lo deja así), que npm no entiende y haría fallar la Action.
  assert.match(pkg.devDependencies['cmtool-core'], /^\d+\.\d+\.\d+$/);
});

// El paquete es público (ya no tiene "private"): esto cuida qué sube a npm.
test('el paquete publica solo bin/, el build y el CHANGELOG, con licencia MIT', () => {
  const root = path.join(import.meta.dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.deepEqual(pkg.files, ['bin', 'dist', 'CHANGELOG.md']);
  for (const file of Object.values(pkg.bin) as string[]) assert.match(file, /^\.\/bin\//);
  assert.equal(pkg.license, 'MIT');
  assert.match(fs.readFileSync(path.join(root, 'LICENSE'), 'utf8'), /^MIT License\n\nCopyright \(c\) \d{4} \S/);
});

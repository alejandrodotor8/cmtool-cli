import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { APP_NAME, VERSION } from '../src/app.ts';

test('APP_NAME y VERSION son los de package.json, y el comando del build se llama igual', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf8'));
  assert.equal(VERSION, pkg.version);
  assert.equal(APP_NAME, pkg.name);
  assert.ok(pkg.bin[APP_NAME], 'package.json bin debe tener un comando con el nombre del paquete');
  assert.ok(pkg.bin[`${APP_NAME}-dev`], 'y su versión -dev');
});

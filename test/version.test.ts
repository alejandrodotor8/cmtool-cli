import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { VERSION } from '../src/version.ts';

test('VERSION es la de package.json', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf8'));
  assert.equal(VERSION, pkg.version);
});

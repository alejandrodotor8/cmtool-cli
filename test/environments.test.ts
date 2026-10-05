import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { resolveEnvironment } from '../src/core/environments.ts';

describe('resolveEnvironment', () => {
  const envs = [
    { id: 'develop', aliases: [] },
    { id: 'master-2026-10', aliases: ['master'] },
  ];

  test('por ID', () => {
    assert.equal(resolveEnvironment(envs, 'develop'), 'develop');
  });

  test('por alias', () => {
    assert.equal(resolveEnvironment(envs, 'master'), 'master-2026-10');
  });

  test('si no existe, nada', () => {
    assert.equal(resolveEnvironment(envs, 'qa'), undefined);
  });
});

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseCliArgs } from '../src/cli-args.ts';
import { AbortError } from '../src/errors.ts';

describe('parseCliArgs', () => {
  test('sin argumentos migra', () => {
    assert.deepEqual(parseCliArgs([]), { command: 'migrate', dryRun: false, help: false, file: undefined });
  });

  test('--dry-run', () => {
    assert.equal(parseCliArgs(['--dry-run']).dryRun, true);
    assert.equal(parseCliArgs(['restore', '--dry-run']).dryRun, true);
  });

  test('restore con y sin archivo', () => {
    assert.deepEqual(parseCliArgs(['restore']), { command: 'restore', dryRun: false, help: false, file: undefined });
    assert.equal(parseCliArgs(['restore', 'respaldo.json']).file, 'respaldo.json');
  });

  test('ayuda', () => {
    assert.equal(parseCliArgs(['-h']).help, true);
    assert.equal(parseCliArgs(['--help']).help, true);
  });

  for (const argv of [['borrar'], ['--force'], ['restore', 'a.json', 'b.json'], ['migrate', 'algo']]) {
    test(`rechaza argumentos inválidos: ${argv.join(' ')}`, () => {
      assert.throws(() => parseCliArgs(argv), AbortError);
    });
  }
});

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseCliArgs, repeatCommand } from '../src/cli-args.ts';
import { AbortError } from '../src/errors.ts';

const defaults = {
  command: 'migrate',
  dryRun: false,
  verbose: false,
  help: false,
  file: undefined,
  space: undefined,
  from: undefined,
  to: undefined,
  ids: undefined,
};

describe('parseCliArgs', () => {
  test('sin argumentos migra y pregunta todo', () => {
    assert.deepEqual(parseCliArgs([]), defaults);
  });

  test('--dry-run y --verbose', () => {
    assert.equal(parseCliArgs(['--dry-run']).dryRun, true);
    assert.equal(parseCliArgs(['--verbose']).verbose, true);
    assert.equal(parseCliArgs(['restore', '--dry-run', '--verbose']).verbose, true);
  });

  test('restore con y sin archivo', () => {
    assert.deepEqual(parseCliArgs(['restore']), { ...defaults, command: 'restore' });
    assert.equal(parseCliArgs(['restore', 'respaldo.json']).file, 'respaldo.json');
  });

  test('ayuda', () => {
    assert.equal(parseCliArgs(['-h']).help, true);
    assert.equal(parseCliArgs(['--help']).help, true);
  });

  test('flags para no pasar por los menús', () => {
    const args = parseCliArgs([
      '--space',
      's1',
      '--from',
      'develop',
      '--to',
      'qa',
      '--ids',
      'a, b,https://x/entries/c',
    ]);
    assert.equal(args.space, 's1');
    assert.equal(args.from, 'develop');
    assert.equal(args.to, 'qa');
    assert.deepEqual(args.ids, ['a', 'b', 'c']);
  });

  for (const argv of [
    ['borrar'],
    ['--force'],
    ['restore', 'a.json', 'b.json'],
    ['migrate', 'algo'],
    ['restore', '--from', 'develop'],
    ['--ids', ' , '],
    ['--space', ' '],
    ['--from'],
  ]) {
    test(`rechaza argumentos inválidos: ${argv.join(' ')}`, () => {
      assert.throws(() => parseCliArgs(argv), AbortError);
    });
  }
});

describe('repeatCommand', () => {
  test('arma el comando con flags para repetir la migración', () => {
    assert.equal(
      repeatCommand({ spaceId: 's1', src: 'develop', dst: 'qa', rootIds: ['a', 'b'] }),
      'ctf-migrate --space s1 --from develop --to qa --ids a,b',
    );
  });

  test('el comando que arma se vuelve a leer igual', () => {
    const command = repeatCommand({ spaceId: 's1', src: 'develop', dst: 'qa', rootIds: ['a', 'b'] });
    const args = parseCliArgs(command.split(' ').slice(1));
    assert.deepEqual([args.space, args.from, args.to, args.ids], ['s1', 'develop', 'qa', ['a', 'b']]);
  });
});

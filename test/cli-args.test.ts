import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { VERSION } from '../src/app.ts';
import { COMMANDS, FLAGS, parseCliArgs, repeatCommand, usage, validateFlags } from '../src/cli-args.ts';
import { AbortError } from '../src/errors.ts';

describe('parseCliArgs: comandos', () => {
  test('sin argumentos no hay comando: se elige en el menú', () => {
    assert.equal(parseCliArgs([]).command, undefined);
  });

  test('reconoce cada comando', () => {
    for (const command of Object.keys(COMMANDS)) assert.equal(parseCliArgs([command]).command, command);
  });

  test('flags para elegir entries sin comando llevan a migrate (atajo)', () => {
    assert.equal(parseCliArgs(['--ids', 'a,b']).command, 'migrate');
    assert.equal(parseCliArgs(['--since', '7d']).command, 'migrate');
  });

  test('solo ambientes, sin comando: el menú sigue preguntando qué hacer', () => {
    const args = parseCliArgs(['--from', 'develop', '--to', 'qa']);
    assert.equal(args.command, undefined);
    assert.deepEqual([args.from, args.to], ['develop', 'qa']);
  });

  test('restore con y sin archivo', () => {
    assert.equal(parseCliArgs(['restore']).file, undefined);
    assert.equal(parseCliArgs(['restore', 'respaldo.json']).file, 'respaldo.json');
  });
});

describe('parseCliArgs: flags', () => {
  test('flags para elegir entries', () => {
    const args = parseCliArgs([
      'migrate',
      '--ids',
      'a, b,https://x/entries/c',
      '--content-type',
      'banner, slide',
      '--tag',
      'navidad',
      '--search',
      'Ramon',
      '--mine',
      '--missing',
      '--ids-file',
      'lista.csv',
    ]);
    assert.deepEqual(args.ids, ['a', 'b', 'c']);
    assert.deepEqual(args.contentTypes, ['banner', 'slide']);
    assert.equal(args.tag, 'navidad');
    assert.equal(args.search, 'Ramon');
    assert.equal(args.mine, true);
    assert.equal(args.missing, true);
    assert.equal(args.idsFile, 'lista.csv');
  });

  test('--since entiende hoy, días y fechas', () => {
    assert.ok(parseCliArgs(['--since', 'hoy']).since);
    assert.ok(parseCliArgs(['--since', '7d']).since);
    assert.ok(parseCliArgs(['--since', '2026-10-01']).since);
  });

  test('--version, -v, --help y -h', () => {
    assert.equal(parseCliArgs(['--version']).version, true);
    assert.equal(parseCliArgs(['-v']).version, true);
    assert.equal(parseCliArgs(['-h']).help, true);
    assert.equal(parseCliArgs(['--help']).help, true);
  });

  for (const argv of [
    ['borrar'],
    ['--force'],
    ['restore', 'a.json', 'b.json'],
    ['migrate', 'algo'],
    ['restore', '--from', 'develop'],
    ['history', '--space', 's1'],
    ['status', '--ids', 'a'],
    ['compare-models', '--dry-run'],
    ['--ids', ' , '],
    ['--ids', 'abc,https://app.contentful.com/spaces/s1/assets/img1'],
    ['--space', ' '],
    ['--from'],
    ['--since', 'ayer'],
    ['--since', '2026-02-30'],
  ]) {
    test(`rechaza: ${argv.join(' ')}`, () => {
      assert.throws(() => parseCliArgs(argv), AbortError);
    });
  }
});

describe('validateFlags', () => {
  test('revisa los flags contra el comando elegido en el menú', () => {
    const args = parseCliArgs(['--from', 'develop']);
    assert.doesNotThrow(() => validateFlags('status', args));
    assert.throws(() => validateFlags('history', args), AbortError);
  });

  test('cada flag declara a qué comandos sirve, y esos comandos existen', () => {
    for (const [name, flag] of Object.entries(FLAGS)) {
      if (flag.commands === 'global') continue;
      for (const command of flag.commands) assert.ok(command in COMMANDS, `--${name}: ${command}`);
    }
  });
});

describe('repeatCommand', () => {
  test('arma el comando con flags para repetir la migración', () => {
    assert.equal(
      repeatCommand('migrate', { spaceId: 's1', src: 'develop', dst: 'qa', ids: ['a', 'b'] }),
      'cfm migrate --space s1 --from develop --to qa --ids a,b',
    );
  });

  test('incluye las decisiones, así no vuelve a preguntar', () => {
    assert.equal(
      repeatCommand('migrate', {
        spaceId: 's1',
        src: 'develop',
        dst: 'qa',
        ids: ['a'],
        update: 'all',
        assets: false,
        model: ['add:banner.cta', 'editor:banner.title'],
      }),
      'cfm migrate --space s1 --from develop --to qa --ids a --update all --no-assets --model add:banner.cta,editor:banner.title',
    );
  });

  test('el comando que arma se vuelve a leer igual', () => {
    const command = repeatCommand('migrate', {
      spaceId: 's1',
      src: 'develop',
      dst: 'qa',
      ids: ['a', 'b'],
      update: ['a'],
      assets: true,
      model: 'none',
    });
    const args = parseCliArgs(command.split(' ').slice(1));
    assert.deepEqual(
      [args.command, args.space, args.from, args.to, args.ids, args.update, args.assets, args.model],
      ['migrate', 's1', 'develop', 'qa', ['a', 'b'], ['a'], true, 'none'],
    );
  });

  test('otros comandos: modelo con --content-type y --model', () => {
    const command = repeatCommand('migrate-model', {
      spaceId: 's1',
      src: 'develop',
      dst: 'master',
      contentTypes: ['banner'],
      model: 'all',
    });
    const args = parseCliArgs(command.split(' ').slice(1));
    assert.deepEqual([args.command, args.contentTypes, args.model], ['migrate-model', ['banner'], 'all']);
  });
});

describe('flags de decisión', () => {
  test('--update y --model aceptan all, none o una lista', () => {
    assert.equal(parseCliArgs(['migrate', '--update', 'ALL']).update, 'all');
    assert.deepEqual(parseCliArgs(['migrate', '--update', 'a, b']).update, ['a', 'b']);
    assert.equal(parseCliArgs(['migrate-model', '--model', 'none']).model, 'none');
  });

  test('--assets y --no-assets; sin ninguno, se pregunta', () => {
    assert.equal(parseCliArgs(['migrate', '--assets']).assets, true);
    assert.equal(parseCliArgs(['migrate', '--no-assets']).assets, false);
    assert.equal(parseCliArgs(['migrate']).assets, undefined);
  });

  test('no sirven en comandos que no los usan', () => {
    assert.throws(() => parseCliArgs(['compare-models', '--model', 'all']), /no sirve/);
    assert.throws(() => parseCliArgs(['status', '--no-assets']), /no sirve/);
  });
});

describe('usage', () => {
  test('lista la versión, cada comando y cada flag', () => {
    const text = usage();
    assert.match(text, new RegExp(VERSION.replace(/\./g, '\\.')));
    for (const command of Object.keys(COMMANDS)) assert.match(text, new RegExp(`\\b${command}\\b`));
    for (const flag of Object.keys(FLAGS)) assert.match(text, new RegExp(`--${flag}\\b`));
  });
});

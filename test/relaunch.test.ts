import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { openInTerminal, opensInTerminal } from '../src/ui/relaunch.ts';

const APP = '/Applications/cfm.app/Contents/MacOS/cfm';

describe('opensInTerminal', () => {
  test('la .app abierta desde Finder (sin terminal ni argumentos) se abre en una terminal', () => {
    assert.equal(opensInTerminal('darwin', APP, [], false), true);
    assert.equal(opensInTerminal('darwin', '/Users/ana/Mi Carpeta/cfm.app/Contents/MacOS/cfm', [], false), true);
  });

  test('desde una terminal, con argumentos, fuera de una .app o en otro sistema, corre normal', () => {
    assert.equal(opensInTerminal('darwin', APP, [], true), false);
    assert.equal(opensInTerminal('darwin', APP, ['--version'], false), false);
    assert.equal(opensInTerminal('darwin', '/usr/local/bin/cfm', [], false), false);
    assert.equal(opensInTerminal('win32', APP, [], false), false);
  });
});

describe('openInTerminal', () => {
  /** Registra los comandos y responde con los códigos de salida dados, en orden. */
  const fakeRun = (codes: number[]) => {
    const calls: string[][] = [];
    return {
      calls,
      run: (command: string, args: string[]) => {
        calls.push([command, ...args]);
        return codes.shift() ?? 0;
      },
    };
  };

  test('usa la terminal que el usuario eligió para abrir ejecutables', () => {
    const { calls, run } = fakeRun([0]);
    openInTerminal(APP, run);
    assert.deepEqual(calls, [['open', APP]]);
  });

  test('si eso falla, abre Terminal', () => {
    const { calls, run } = fakeRun([1, 0]);
    openInTerminal(APP, run);
    assert.deepEqual(calls, [
      ['open', APP],
      ['open', '-a', 'Terminal', APP],
    ]);
  });
});

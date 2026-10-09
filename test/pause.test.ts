import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { describe, test } from 'node:test';
import { pausesOnExit, waitForEnter } from '../src/ui/pause.ts';

describe('pausesOnExit', () => {
  test('pausa solo en Windows, sin argumentos (doble clic) y con terminal', () => {
    assert.equal(pausesOnExit('win32', [], true), true);
    assert.equal(pausesOnExit('win32', ['migrate'], true), false);
    assert.equal(pausesOnExit('win32', [], false), false);
    assert.equal(pausesOnExit('darwin', [], true), false);
  });
});

describe('waitForEnter', () => {
  test('avisa y termina con un Enter', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const done = waitForEnter(input, output);
    input.write('\n');
    await done;
    assert.match(String(output.read()), /Enter para cerrar/);
  });

  test('también termina si se cierra la entrada', async () => {
    const input = new PassThrough();
    const done = waitForEnter(input, new PassThrough());
    input.end();
    await done;
  });
});

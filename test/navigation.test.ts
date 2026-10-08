import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, test } from 'node:test';
import { BackError, isCancel } from '../src/errors.ts';
import { beforePrompt, cancelledWithEscape, canGoBack, goBack, notePrompt, steps } from '../src/ui/navigation.ts';

/** Una "pregunta" falsa: responde lo siguiente del guion; 'back' es Esc. */
function script(answers: string[]) {
  const asked: string[] = [];
  return {
    asked,
    ask: async (name: string): Promise<string> => {
      asked.push(name);
      const answer = answers.shift();
      if (answer === 'back') goBack();
      notePrompt();
      return answer ?? '';
    },
  };
}

describe('steps', () => {
  test('sin volver, corre los pasos en orden', async () => {
    const { ask, asked } = script(['a', 'b']);
    await steps([async () => void (await ask('uno')), async () => void (await ask('dos'))]);
    assert.deepEqual(asked, ['uno', 'dos']);
  });

  test('volver repite el paso anterior y sigue desde ahí', async () => {
    const { ask, asked } = script(['a', 'back', 'a2', 'b']);
    await steps([async () => void (await ask('uno')), async () => void (await ask('dos'))]);
    assert.deepEqual(asked, ['uno', 'dos', 'uno', 'dos']);
  });

  test('salta hacia atrás los pasos que no preguntaron (resueltos por flags)', async () => {
    const { ask, asked } = script(['a', 'back', 'a2', 'c']);
    let autoRuns = 0;
    await steps([
      async () => void (await ask('uno')),
      async () => {
        autoRuns++;
      },
      async () => void (await ask('tres')),
    ]);
    assert.deepEqual(asked, ['uno', 'tres', 'uno', 'tres']);
    assert.equal(autoRuns, 2, 'el paso automático se vuelve a correr, sin preguntar');
  });

  test('desde el primer paso de un flujo anidado se vuelve al paso de afuera', async () => {
    const { ask, asked } = script(['origen', 'back', 'origen2', 'metodo', 'ids']);
    await steps([
      async () => void (await ask('origen')),
      async () => {
        await steps([async () => void (await ask('metodo')), async () => void (await ask('ids'))]);
      },
    ]);
    assert.deepEqual(asked, ['origen', 'metodo', 'origen', 'metodo', 'ids']);
  });

  test('sin paso anterior, volver sale del flujo (se trata como cancelar)', async () => {
    const { ask } = script(['back']);
    await assert.rejects(steps([async () => void (await ask('uno'))]), (e) => e instanceof BackError && isCancel(e));
  });

  test('un paso puede terminar el flujo antes con un código de salida', async () => {
    const { ask, asked } = script(['a']);
    const code = await steps([
      async () => {
        await ask('uno');
        return 0;
      },
      async () => void (await ask('dos')),
    ]);
    assert.equal(code, 0);
    assert.deepEqual(asked, ['uno']);
  });

  test('canGoBack: solo cuando algún flujo activo ya preguntó algo', async () => {
    const { ask } = script(['a', 'b']);
    const seen: boolean[] = [];
    await steps([
      async () => {
        seen.push(canGoBack());
        await ask('uno');
      },
      async () => {
        seen.push(canGoBack());
        await ask('dos');
      },
    ]);
    assert.deepEqual(seen, [false, true]);
    assert.equal(canGoBack(), false, 'al terminar no queda historia');
  });

  test('los errores que no son volver se propagan', async () => {
    await assert.rejects(
      steps([
        async () => {
          throw new Error('falló la API');
        },
      ]),
      /falló la API/,
    );
  });
});

describe('Esc vs Ctrl+C', () => {
  test('recuerda si la última tecla fue Esc, y lo olvida antes de cada pregunta', () => {
    const input = new EventEmitter() as unknown as NodeJS.ReadStream;
    beforePrompt(input);
    input.emit('keypress', '', { name: 'escape' });
    assert.equal(cancelledWithEscape(), true);

    beforePrompt(input);
    assert.equal(cancelledWithEscape(), false);
    input.emit('keypress', '\u0003', { name: 'c', ctrl: true });
    assert.equal(cancelledWithEscape(), false);
  });
});

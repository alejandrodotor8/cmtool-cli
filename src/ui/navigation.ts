/**
 * Navegación entre preguntas: volver al paso anterior con Esc o con "← Volver".
 *
 * Un flujo es una lista de pasos. Cada paso puede preguntar algo; si el usuario vuelve,
 * se repite el último paso que preguntó (los que se resolvieron solos, por flags o por
 * tener una sola opción, se vuelven a correr sin preguntar). Los flujos se anidan: si un
 * paso tiene sus propios pasos y el usuario vuelve desde el primero, se vuelve al paso
 * anterior del flujo de afuera. Sin a dónde volver, Esc cancela como Ctrl+C.
 */
import { BackError } from '../errors.ts';

/** Un paso: devuelve un código de salida para terminar el flujo antes, o nada para seguir. */
export type Step = () => Promise<number | undefined | void>;

/** Por cada flujo activo (del más externo al más interno), los pasos que preguntaron algo. */
const active: number[][] = [];
let prompts = 0;

/** Lo llaman las preguntas al responderse: así un flujo sabe qué pasos preguntaron. */
export const notePrompt = (): void => {
  prompts++;
};

/** Hay un paso anterior al que volver. */
export const canGoBack = (): boolean => active.some((asked) => asked.length > 0);

/** Volver al paso anterior desde el código (por ejemplo, una búsqueda sin resultados). */
export function goBack(): never {
  throw new BackError();
}

/** Corre los pasos en orden, volviendo atrás cuando se pide. Devuelve el código de salida de un paso que terminó antes. */
export async function steps(list: Step[]): Promise<number | undefined> {
  const asked: number[] = [];
  active.push(asked);
  try {
    let i = 0;
    while (i < list.length) {
      const step = list[i] as Step;
      const before = prompts;
      try {
        const exit = await step();
        if (prompts > before) asked.push(i);
        if (typeof exit === 'number') return exit;
        i++;
      } catch (e) {
        if (!(e instanceof BackError)) throw e;
        const previous = asked.pop();
        if (previous === undefined) throw e; // sin paso anterior aquí: vuelve el flujo de afuera
        i = previous;
      }
    }
    return undefined;
  } finally {
    active.pop();
  }
}

// ───────────── Esc (volver) vs Ctrl+C (salir) ─────────────
// La librería de preguntas trata las dos teclas igual (cancelar). Para distinguirlas se
// mira la última tecla que llegó a la terminal.

let lastKey: string | undefined;
let listening = false;

/** Empieza a escuchar las teclas (una vez) y olvida la última, antes de cada pregunta. */
export function beforePrompt(input: NodeJS.ReadStream = process.stdin): void {
  if (!listening) {
    input.on('keypress', (_: string, key?: { name?: string }) => {
      lastKey = key?.name;
    });
    listening = true;
  }
  lastKey = undefined;
}

/** La pregunta se canceló con Esc (no con Ctrl+C). */
export const cancelledWithEscape = (): boolean => lastKey === 'escape';

/**
 * Indicador de "trabajando…" para pasos que llaman a la API. Con animación es un spinner;
 * sin ella (--verbose o salida que no es una terminal), mensajes normales.
 */
import * as p from '@clack/prompts';
import { log } from './log.ts';

export interface Status {
  update(message: string): void;
  done(message: string): void;
  fail(message: string): void;
}

function startStatus(message: string, animate: boolean): Status {
  if (!animate) {
    log.step(message);
    return { update: (m) => log.info(m), done: (m) => log.ok(m), fail: (m) => log.err(m) };
  }
  const spin = p.spinner();
  spin.start(message);
  return { update: (m) => spin.message(m), done: (m) => spin.stop(m), fail: (m) => spin.error(m) };
}

/** Corre `fn` con el indicador; si falla, lo cierra en rojo antes de seguir con el error. */
export async function withStatus<T>(
  message: string,
  animate: boolean,
  fn: (status: Status) => Promise<T>,
  done: (result: T) => string,
): Promise<T> {
  const status = startStatus(message, animate);
  try {
    const result = await fn(status);
    status.done(done(result));
    return result;
  } catch (e) {
    status.fail(message);
    throw e;
  }
}

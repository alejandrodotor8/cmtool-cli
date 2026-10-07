/**
 * Mensajes en la terminal, con el estilo de clack: todo cuelga de una línea vertical (│).
 */
import * as p from '@clack/prompts';
import pc from 'picocolors';

const rail = pc.gray(p.S_BAR);

export const log = {
  /** Título de una sección. */
  step: (m: string) => p.log.step(m),
  ok: (m: string) => p.log.success(m),
  warn: (m: string) => p.log.warn(m),
  err: (m: string) => p.log.error(m),
  /** Detalle secundario, pegado al mensaje anterior. */
  info: (m: string) => p.log.message(pc.dim(m), { symbol: rail, spacing: 0 }),
  /** Bloque de texto (tablas, listas) sobre la línea vertical. `spacing` = líneas en blanco antes. */
  block: (text: string, spacing = 0) => p.log.message(text, { symbol: rail, spacing }),
};

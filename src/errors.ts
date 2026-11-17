/**
 * Errores de la terminal: cancelar o volver en una pregunta. Los demás (AbortError, formatError)
 * son del núcleo, cmtool-core.
 */

/** El usuario canceló (Ctrl+C, o Esc cuando no hay a dónde volver). */
export class CancelError extends Error {
  constructor() {
    super('Cancelado');
    this.name = 'CancelError';
  }
}

/** El usuario pidió volver al paso anterior (Esc o "← Volver"). Lo atrapa `steps`. */
export class BackError extends Error {
  constructor() {
    super('Volver');
    this.name = 'BackError';
  }
}

/** Cancelar, o volver sin un paso anterior: se sale sin escribir nada. */
export const isCancel = (e: unknown): boolean => e instanceof CancelError || e instanceof BackError;

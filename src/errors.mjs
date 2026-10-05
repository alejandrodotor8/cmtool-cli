/** Error esperado: corta el flujo mostrando un mensaje claro, sin stack trace. */
export class AbortError extends Error {
  constructor(message, hint) {
    super(message);
    this.name = 'AbortError';
    this.hint = hint;
  }
}

export const isNotFound = (e) => e?.name === 'NotFound' || e?.status === 404;

/** El usuario canceló un prompt (Ctrl+C). */
export const isCancel = (e) => e?.name === 'ExitPromptError';

/**
 * Mensaje legible de un error del CMA. Solo usa status, mensaje y detalles:
 * nunca imprime la request, que lleva el token en los headers.
 */
export function formatError(e) {
  try {
    const p = JSON.parse(e.message);
    const details = (p.details?.errors ?? [])
      .map((d) => `${d.name}${d.path ? ' en ' + d.path.join('.') : ''}${d.details ? ': ' + d.details : ''}`)
      .join('; ');
    return `${p.status} ${p.statusText}: ${p.message}${details ? ' → ' + details : ''}`;
  } catch {
    return e?.message ?? String(e);
  }
}

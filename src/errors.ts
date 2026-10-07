import { APP_NAME } from './app.ts';

/** Error esperado: corta el flujo mostrando un mensaje claro, sin stack trace. */
export class AbortError extends Error {
  readonly hint: string | undefined;

  constructor(message: string, hint?: string) {
    super(message);
    this.name = 'AbortError';
    this.hint = hint;
  }
}

/** El usuario canceló una pregunta (Ctrl+C o Esc). */
export class CancelError extends Error {
  constructor() {
    super('Cancelado');
    this.name = 'CancelError';
  }
}

export const isCancel = (e: unknown): boolean => e instanceof CancelError;

/** Lo que trae el mensaje (JSON) de un error del CMA. */
interface CmaErrorBody {
  status?: number;
  statusText?: string;
  message?: string;
  details?: { errors?: { name: string; path?: (string | number)[]; details?: string }[] };
}

/**
 * Mensaje legible de un error del CMA. Solo usa status, mensaje y detalles:
 * nunca imprime la request, que lleva el token en los headers.
 */
export function formatError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  try {
    const body = JSON.parse(message) as CmaErrorBody;
    const details = (body.details?.errors ?? [])
      .map((d) => `${d.name}${d.path ? ` en ${d.path.join('.')}` : ''}${d.details ? `: ${d.details}` : ''}`)
      .join('; ');
    const conflict =
      e instanceof Error && e.name === 'VersionMismatch'
        ? ` (alguien la modificó al mismo tiempo en Contentful; vuelve a correr ${APP_NAME})`
        : '';
    return `${body.status} ${body.statusText}: ${body.message}${details ? ` → ${details}` : ''}${conflict}`;
  } catch {
    return message;
  }
}

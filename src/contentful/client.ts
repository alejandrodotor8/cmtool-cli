import { createClient } from 'contentful-management';
import type { Session } from '../session.ts';
import type { Cma } from './types.ts';

/** Se llama en cada petición a la API (incluidos los reintentos) con una descripción sin datos sensibles. */
export type RequestListener = (request: string) => void;

interface RequestInfo {
  method?: string;
  url?: string;
  params?: Record<string, unknown>;
}

/** "GET /spaces/…/entries?limit=50": solo método, ruta y parámetros. Nunca headers (llevan el token). */
export function describeRequest({ method, url, params }: RequestInfo): string {
  const query = Object.entries(params ?? {})
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('&');
  return `${(method ?? 'get').toUpperCase()} ${url ?? ''}${query ? `?${query}` : ''}`;
}

/** Cliente "plain" del CMA. Con `spaceId`, todas las llamadas quedan dentro de ese space. */
export function createCma(
  { token, host }: Pick<Session, 'token' | 'host'>,
  spaceId?: string,
  onRequest?: RequestListener,
): Cma {
  return createClient(
    {
      accessToken: token,
      host,
      requestLogger: (request: unknown) => {
        if (onRequest && !(request instanceof Error)) onRequest(describeRequest(request as RequestInfo));
      },
    },
    { type: 'plain', defaults: spaceId ? { spaceId } : undefined },
  );
}

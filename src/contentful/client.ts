import { createClient } from 'contentful-management';
import type { Session } from '../session.ts';
import type { Cma } from './types.ts';

/** Cliente "plain" del CMA. Con `spaceId`, todas las llamadas quedan dentro de ese space. */
export function createCma({ token, host }: Pick<Session, 'token' | 'host'>, spaceId?: string): Cma {
  return createClient({ accessToken: token, host }, { type: 'plain', defaults: spaceId ? { spaceId } : undefined });
}

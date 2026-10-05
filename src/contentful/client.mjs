import { createClient } from 'contentful-management';

/** Cliente "plain" del CMA. Con `spaceId`, todas las llamadas quedan dentro de ese space. */
export const createCma = ({ token, host }, spaceId) =>
  createClient({ accessToken: token, host }, { type: 'plain', ...(spaceId && { defaults: { spaceId } }) });

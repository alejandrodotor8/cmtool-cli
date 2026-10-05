import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AbortError } from './errors.mjs';

/** Hosts del CMA a los que se permite enviar el token, con su app web. */
const CMA_HOSTS = {
  'api.contentful.com': 'app.contentful.com',
  'api.eu.contentful.com': 'app.eu.contentful.com',
};

/** Lee la sesión que dejó `contentful login` (misma búsqueda que el CLI). */
function readCliConfig() {
  const candidates = [];
  if (process.env.CONTENTFUL_CONFIG_FILE) candidates.push(process.env.CONTENTFUL_CONFIG_FILE);
  let dir = process.cwd();
  while (true) {
    candidates.push(path.join(dir, '.contentfulrc.json'));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  candidates.push(path.join(os.homedir(), '.contentfulrc.json'));
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      /* archivo inválido, sigue buscando */
    }
  }
  return {};
}

/**
 * Token y host para hablar con Contentful. El token sale de CONTENTFUL_MANAGEMENT_TOKEN
 * o de la sesión del CLI, y solo se envía a un host oficial de Contentful.
 */
export function loadSession() {
  const cfg = readCliConfig();
  const token = process.env.CONTENTFUL_MANAGEMENT_TOKEN || cfg.managementToken;
  if (!token) throw new AbortError('No encontré una sesión.', 'Corre primero: contentful login');

  const host = cfg.host || 'api.contentful.com';
  const appHost = CMA_HOSTS[host];
  if (!appHost) {
    throw new AbortError(`El host "${host}" de tu .contentfulrc.json no es de Contentful; no envío el token ahí.`);
  }
  return { token, host, appHost, defaultSpaceId: cfg.activeSpaceId };
}

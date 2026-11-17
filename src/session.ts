import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AbortError, CMA_HOSTS } from 'cmtool-core';
import { APP_NAME } from './app.ts';

const CONFIG_NAME = '.contentfulrc.json';

export interface Session {
  token: string;
  host: string;
  appHost: string;
  defaultSpaceId: string | undefined;
}

/** Lo que nos interesa del `.contentfulrc.json` que deja `contentful login`. */
interface CliConfig {
  managementToken?: string;
  host?: string;
  activeSpaceId?: string;
}

/** Los `.contentfulrc.json` de la carpeta actual hacia arriba (como busca el Contentful CLI). */
function upwardFiles(): string[] {
  const files: string[] = [];
  let dir = process.cwd();
  while (true) {
    files.push(path.join(dir, CONFIG_NAME));
    const parent = path.dirname(dir);
    if (parent === dir) return files;
    dir = parent;
  }
}

/** El archivo de sesión que se usa y lo que tiene: el que dejó `contentful login` (misma búsqueda que el CLI). */
function findCliConfig(): { file: string; config: CliConfig } | undefined {
  const candidates: string[] = [];
  if (process.env.CONTENTFUL_CONFIG_FILE) candidates.push(process.env.CONTENTFUL_CONFIG_FILE);
  candidates.push(...upwardFiles(), path.join(os.homedir(), CONFIG_NAME));
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      return { file, config: JSON.parse(fs.readFileSync(file, 'utf8')) as CliConfig };
    } catch {
      /* archivo inválido, sigue buscando */
    }
  }
  return undefined;
}

const readCliConfig = (): CliConfig => findCliConfig()?.config ?? {};

/** Si hay un token (variable de entorno o archivo de sesión). No revisa que funcione. */
export const hasSession = (): boolean =>
  Boolean(process.env.CONTENTFUL_MANAGEMENT_TOKEN || readCliConfig().managementToken);

/**
 * Token y host para hablar con Contentful. El token sale de CONTENTFUL_MANAGEMENT_TOKEN
 * o de la sesión del CLI, y solo se envía a un host oficial de Contentful.
 */
export function loadSession(): Session {
  const cfg = readCliConfig();
  const token = process.env.CONTENTFUL_MANAGEMENT_TOKEN || cfg.managementToken;
  if (!token) {
    throw new AbortError('No encontré una sesión.', `Corre ${APP_NAME} login para pegar un token, o contentful login.`);
  }

  const host = cfg.host || 'api.contentful.com';
  const appHost = CMA_HOSTS.get(host);
  if (!appHost) {
    throw new AbortError(`El host "${host}" de tu .contentfulrc.json no es de Contentful; no envío el token ahí.`);
  }
  return { token, host, appHost, defaultSpaceId: cfg.activeSpaceId };
}

/** Como valida el Contentful CLI: entre 43 y 64 letras, números, `-` o `_` (los personales empiezan con CFPAT-). */
export const looksLikeToken = (value: string): boolean => /^[A-Za-z0-9_-]{43,64}$/.test(value.trim());

/**
 * Dónde se guarda la sesión, igual que `contentful login`: CONTENTFUL_CONFIG_FILE, el primer
 * `.contentfulrc.json` de la carpeta actual hacia arriba, o el de tu carpeta personal.
 */
export function sessionFile(): string {
  if (process.env.CONTENTFUL_CONFIG_FILE) return process.env.CONTENTFUL_CONFIG_FILE;
  return upwardFiles().find((file) => fs.existsSync(file)) ?? path.join(os.homedir(), CONFIG_NAME);
}

/**
 * Guarda el token como `contentful login` (mismo archivo y formato), sin tocar lo demás que
 * tenga el archivo. Solo lo puede leer tu usuario. Devuelve dónde quedó.
 */
export function saveToken(token: string, host: string): string {
  if (!CMA_HOSTS.has(host)) throw new AbortError(`"${host}" no es un host de Contentful.`);
  const file = sessionFile();
  let current: Record<string, unknown> = {};
  if (fs.existsSync(file)) {
    try {
      current = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      throw new AbortError(`No pude leer ${file}: no es JSON válido.`, 'Corrígelo o bórralo, y vuelve a intentar.');
    }
  }
  fs.writeFileSync(file, `${JSON.stringify({ ...current, managementToken: token.trim(), host }, null, 2)}\n`, {
    mode: 0o600,
  });
  fs.chmodSync(file, 0o600); // si ya existía, `mode` no aplica
  return file;
}

/** El archivo de sesión, si tiene un token guardado (sin contar CONTENTFUL_MANAGEMENT_TOKEN). */
export function savedTokenFile(): string | undefined {
  const found = findCliConfig();
  return found?.config.managementToken ? found.file : undefined;
}

/**
 * Quita el token del archivo de sesión, como `contentful logout`, sin tocar lo demás del archivo.
 * Devuelve de qué archivo lo quitó, o `undefined` si no había un token guardado.
 */
export function forgetToken(): string | undefined {
  const found = findCliConfig();
  if (!found?.config.managementToken) return undefined;
  const rest = Object.fromEntries(Object.entries(found.config).filter(([key]) => key !== 'managementToken'));
  fs.writeFileSync(found.file, `${JSON.stringify(rest, null, 2)}\n`);
  return found.file;
}

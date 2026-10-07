import { readFileSync } from 'node:fs';

/** Datos de package.json. Funcionan igual desde src/ (desarrollo) y desde dist/ (build). */
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  name: string;
  version: string;
};

/** Nombre del comando (el de package.json): se usa en todos los mensajes que muestran un comando. */
export const APP_NAME = pkg.name;
export const VERSION = pkg.version;

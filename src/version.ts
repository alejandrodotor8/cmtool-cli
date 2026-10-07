import { readFileSync } from 'node:fs';

/** Versión de package.json. Funciona igual desde src/ (desarrollo) y desde dist/ (build). */
export const VERSION: string = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

/**
 * ¿El build quedó viejo? Compara la fecha de modificación del código (los .ts de src/ y el
 * JavaScript del núcleo compilado) con la del build. Cambia cuando editas el código, cambias de
 * rama, fusionas o recompilas el núcleo enlazado sin volver a compilar el CLI.
 */
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/** El código que cuenta: TypeScript (src/ y los tipos del núcleo) y JavaScript (el núcleo compilado). */
const CODE = /\.(ts|js)$/;

/**
 * Fecha de modificación más reciente (ms) del código dentro de `dir`.
 * @param {string} dir
 * @returns {number}
 */
function newestSourceTime(dir) {
  let newest = 0;
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) newest = Math.max(newest, newestSourceTime(file));
    else if (CODE.test(item.name)) newest = Math.max(newest, statSync(file).mtimeMs);
  }
  return newest;
}

/**
 * `true` si algún archivo de código de `srcDirs` es más nuevo que `builtFile`.
 * @param {string[]} srcDirs
 * @param {string} builtFile
 * @returns {boolean}
 */
export function buildIsStale(srcDirs, builtFile) {
  return Math.max(0, ...srcDirs.map(newestSourceTime)) > statSync(builtFile).mtimeMs;
}

/**
 * ¿El build quedó viejo? Compara la fecha de modificación de los .ts de src/ con la del
 * build. Cambia cuando editas el código, cambias de rama o fusionas sin volver a compilar.
 */
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Fecha de modificación más reciente (ms) de los .ts dentro de `dir`.
 * @param {string} dir
 * @returns {number}
 */
function newestSourceTime(dir) {
  let newest = 0;
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) newest = Math.max(newest, newestSourceTime(file));
    else if (item.name.endsWith('.ts')) newest = Math.max(newest, statSync(file).mtimeMs);
  }
  return newest;
}

/**
 * `true` si algún archivo de `srcDir` es más nuevo que `builtFile`.
 * @param {string} srcDir
 * @param {string} builtFile
 * @returns {boolean}
 */
export function buildIsStale(srcDir, builtFile) {
  return newestSourceTime(srcDir) > statSync(builtFile).mtimeMs;
}

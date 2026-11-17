#!/usr/bin/env node
/**
 * cfm-dev: corre el código fuente del CLI (src/) sin compilar. Node (>= 22.18) quita los tipos
 * de los .ts al vuelo, así que cualquier cambio se ve en la siguiente ejecución. El núcleo
 * (cmtool-core) se usa ya compilado, desde node_modules, como cualquier dependencia.
 *
 * Solo sirve desde el repositorio (con `bun link` o `npm link`): el paquete de npm no trae src/.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

if (!existsSync(fileURLToPath(new URL('../src/cli.ts', import.meta.url)))) {
  console.error('cfm-dev corre el código fuente, y solo funciona desde el repositorio de cmtool-cli. Usa cfm.');
  process.exit(1);
}

const { run } = await import('../src/cli.ts');
await run(process.argv.slice(2), 'dev');

#!/usr/bin/env node
/**
 * cfm: corre la versión compilada (dist/). Se genera con el script `build`
 * y no cambia hasta que vuelvas a compilar. Para correr el código fuente, usa el script `dev`.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pc from 'picocolors';
import { buildIsStale } from './stale-build.mjs';

const BUILD_HINT = 'npm run build, pnpm build, yarn build o bun run build';
const entry = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
// El build lleva el CLI y el núcleo (cmtool-core, ya compilado en su dist/): si cambia cualquiera de
// los dos, queda viejo. Instalado desde npm no hay ninguna de las dos carpetas y no se revisa nada.
const srcDirs = ['../src', '../node_modules/cmtool-core/dist'].map((dir) =>
  fileURLToPath(new URL(dir, import.meta.url)),
);

if (!existsSync(entry)) {
  console.error(
    `cfm: todavía no hay build. En la carpeta del proyecto corre el script "build"\n(${BUILD_HINT}), o el script "dev" para correr el código fuente.`,
  );
  process.exit(1);
}

// Avisa, pero no bloquea: puede que quieras correr el build anterior a propósito.
if (
  buildIsStale(
    srcDirs.filter((dir) => existsSync(dir)),
    entry,
  )
) {
  console.error(
    pc.yellow('⚠ El build es más viejo que el código (src/ o cmtool-core): estás corriendo una versión anterior.\n') +
      pc.dim(`  Para usar los cambios, corre el script "build" (${BUILD_HINT}) o usa el script "dev".`),
  );
}

const { run } = await import(new URL('../dist/cli.js', import.meta.url).href);
await run(process.argv.slice(2), 'build');

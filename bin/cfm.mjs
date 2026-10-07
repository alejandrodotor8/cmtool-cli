#!/usr/bin/env node
/**
 * cfm: corre la versión compilada (dist/). Se genera con el script `build`
 * y no cambia hasta que vuelvas a compilar. Para correr el código fuente, usa cfm-dev.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pc from 'picocolors';
import { buildIsStale } from './stale-build.mjs';

const BUILD_HINT = 'npm run build, pnpm build o bun run build';
const entry = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const srcDir = fileURLToPath(new URL('../src', import.meta.url));

if (!existsSync(entry)) {
  console.error(
    `cfm: todavía no hay build. En la carpeta del proyecto corre el script "build"\n(${BUILD_HINT}), o usa cfm-dev para correr el código fuente.`,
  );
  process.exit(1);
}

// Avisa, pero no bloquea: puede que quieras correr el build anterior a propósito.
if (existsSync(srcDir) && buildIsStale(srcDir, entry)) {
  console.error(
    pc.yellow('⚠ El build es más viejo que el código en src/: estás corriendo una versión anterior.\n') +
      pc.dim(`  Para usar los cambios, corre el script "build" (${BUILD_HINT}) o usa cfm-dev.`),
  );
}

const { run } = await import(new URL('../dist/cli.js', import.meta.url).href);
await run(process.argv.slice(2), 'build');

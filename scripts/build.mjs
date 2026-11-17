/**
 * Build de cfm: empaqueta src/, el núcleo (cmtool-core) y sus dependencias en un solo archivo, dist/cli.js.
 *
 * Arrancar leyendo un archivo es mucho más rápido que leer los ~440 sueltos de src/ y
 * node_modules (sobre todo la primera vez, con el disco en frío). Funciona igual con npm,
 * pnpm y bun, en macOS y Windows.
 */
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
rmSync(new URL('../dist', import.meta.url), { recursive: true, force: true });

await build({
  absWorkingDir: root,
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/cli.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22.18',
  minify: true,
  logLevel: 'warning',
  // Algunas dependencias son CommonJS y usan require(): en un módulo ESM hay que dárselo.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});

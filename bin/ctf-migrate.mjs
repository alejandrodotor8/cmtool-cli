#!/usr/bin/env node
/**
 * ctf-migrate: corre la versión compilada (dist/). Se genera con el script `build`
 * y no cambia hasta que vuelvas a compilar. Para correr el código fuente, usa ctf-migrate-dev.
 */
import { existsSync } from 'node:fs';

const entry = new URL('../dist/cli.js', import.meta.url);
if (!existsSync(entry)) {
  console.error(
    'ctf-migrate: todavía no hay build. En la carpeta del proyecto corre el script "build"\n' +
      '(npm run build, pnpm build o bun run build), o usa ctf-migrate-dev para correr el código fuente.',
  );
  process.exit(1);
}

const { run } = await import(entry.href);
await run(process.argv.slice(2), 'build');

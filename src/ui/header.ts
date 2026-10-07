import pc from 'picocolors';

/** De dónde corre la herramienta: el build (dist/) o el código fuente (src/). */
export type RunMode = 'build' | 'dev';

/** Título del comando, con avisos de --dry-run y de modo desarrollo. */
export function printHeader(title: string, { dryRun, mode, note }: { dryRun: boolean; mode: RunMode; note?: string }) {
  const detail = dryRun ? '  (--dry-run: no se escribe nada)' : note ? `  (${note})` : '';
  const dev = mode === 'dev' ? pc.yellow('  [desarrollo: código fuente]') : '';
  console.log(pc.bold(`\n${title}`) + pc.dim(detail) + dev);
}

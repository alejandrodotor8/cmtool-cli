import pc from 'picocolors';
import type { Column } from '../table.ts';

/** Columnas con el nombre de cada ambiente (✔ / ✖ centrados). */
export const envColumns = (src: string, dst: string): Column[] => [
  { header: src, align: 'center' },
  { header: dst, align: 'center' },
];

/** "develop ──▶ qa". */
export const route = (src: string, dst: string): string => `${pc.bold(src)} ${pc.dim('──▶')} ${pc.bold(dst)}`;

export const formatBytes = (n: number | undefined): string =>
  n == null
    ? ''
    : n < 1024
      ? `${n} B`
      : n < 1024 ** 2
        ? `${Math.round(n / 1024)} KB`
        : `${(n / 1024 ** 2).toFixed(1)} MB`;

export const formatDate = (iso: string | undefined): string =>
  iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '';

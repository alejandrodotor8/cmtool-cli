import pc from 'picocolors';
import type { Column } from '../table.ts';

/** Columnas con el nombre de cada ambiente (✔ / ✖ centrados). */
export const envColumns = (src: string, dst: string): Column[] => [
  { header: src, align: 'center' },
  { header: dst, align: 'center' },
];

/** "develop ──▶ qa". */
export const route = (src: string, dst: string): string => `${pc.bold(src)} ${pc.dim('──▶')} ${pc.bold(dst)}`;

export const formatDate = (iso: string | undefined): string =>
  iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '';

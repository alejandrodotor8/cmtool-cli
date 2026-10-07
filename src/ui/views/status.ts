import pc from 'picocolors';
import type { EnvironmentStatus } from '../../core/status.ts';
import { table } from '../table.ts';
import { route } from './shared.ts';

const missingText = (missing: string[], onlyInDst: string[], dst: string) =>
  [
    missing.length ? pc.yellow(`faltan en ${dst}: ${missing.join(', ')}`) : pc.green('al día'),
    onlyInDst.length ? pc.cyan(`solo en ${dst}: ${onlyInDst.join(', ')}`) : '',
  ]
    .filter(Boolean)
    .join(pc.dim(' · '));

/** Resumen de en qué se diferencian dos ambientes. */
export function renderStatus(status: EnvironmentStatus, { src, dst }: { src: string; dst: string }): void {
  const ct = status.contentTypes;
  table({
    spacing: 1,
    title: `${pc.bold('Estado')}  ${route(src, dst)}`,
    columns: [{}, {}],
    rows: [
      [
        pc.bold('Content types'),
        [
          pc.green(`${ct.same.length} iguales`),
          ct.different.length && pc.yellow(`${ct.different.length} con diferencias`),
          ct.missingInDst.length && pc.red(`${ct.missingInDst.length} no existen en ${dst}`),
          ct.onlyInDst.length && pc.cyan(`${ct.onlyInDst.length} solo en ${dst}`),
        ]
          .filter(Boolean)
          .join(pc.dim(' · ')),
      ],
      [pc.bold('Idiomas'), missingText(status.locales.missingInDst, status.locales.onlyInDst, dst)],
      [pc.bold('Tags'), missingText(status.tags.missingInDst, status.tags.onlyInDst, dst)],
    ],
  });
}

import type { Analysis } from 'cmtool-core';
import pc from 'picocolors';
import { log } from '../log.ts';
import { clip, MARK, table } from '../table.ts';
import { envColumns, formatBytes } from './shared.ts';

/** Lo que necesita la tabla de imágenes (sirve para "migrar entries" y "migrar imágenes"). */
export type AssetsView = Pick<Analysis, 'src' | 'dst' | 'assets'> & { locales: Pick<Analysis['locales'], 'src'> };

/** Imágenes y archivos: si existen en cada ambiente y qué pasa con cada uno. */
export function renderAssets({ src, dst, assets, locales }: AssetsView): void {
  log.step('Imágenes y archivos');
  const locale = locales.src.default;

  const rows = assets.ids.map((id) => {
    const asset = assets.src.get(id);
    const inDst = assets.existing.has(id);
    const dstMark = inDst ? MARK.yes : MARK.no;
    if (!asset) {
      return [
        pc.red('(no existe)'),
        pc.dim(id),
        '',
        MARK.no,
        dstMark,
        inDst ? pc.dim('se reutiliza') : pc.red(`no existe en ${src}`),
      ];
    }
    const files = asset.fields.file ?? {};
    const file = (locale ? files[locale] : undefined) ?? Object.values(files)[0];
    const name = (locale ? asset.fields.title?.[locale] : undefined) ?? file?.fileName ?? '(sin nombre)';
    const img = file?.details?.image as { width: number; height: number } | undefined;
    const detail = [file?.contentType, img && `${img.width}×${img.height}`, formatBytes(file?.details?.size)]
      .filter(Boolean)
      .join(' · ');
    const status = inDst ? pc.green('ya existe → se reutiliza') : pc.yellow(`falta en ${dst}`);
    return [clip(name), pc.dim(id), pc.dim(detail), MARK.yes, dstMark, status];
  });

  table({
    title: `${pc.bold(`${assets.ids.length} archivo(s)`)}  ${pc.dim(`${assets.existing.size} ya existen, ${assets.missing.length} faltan en ${dst}`)}`,
    columns: [
      { header: 'Imagen' },
      { header: 'ID' },
      { header: 'Detalle' },
      ...envColumns(src, dst),
      { header: 'Estado' },
    ],
    rows,
  });
}

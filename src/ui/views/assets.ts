import { type Analysis, assetDetailText, describeAsset } from 'cmtool-core';
import pc from 'picocolors';
import { log } from '../log.ts';
import { clip, MARK, table } from '../table.ts';
import { envColumns } from './shared.ts';

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
    const info = describeAsset(asset, locale);
    const status = inDst ? pc.green('ya existe → se reutiliza') : pc.yellow(`falta en ${dst}`);
    return [clip(info.name), pc.dim(id), pc.dim(assetDetailText(info)), MARK.yes, dstMark, status];
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

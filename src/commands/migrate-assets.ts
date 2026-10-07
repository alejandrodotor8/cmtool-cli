/**
 * `cfm migrate-assets`: copia imágenes y archivos sueltos (sin entries). Los que
 * ya existen en destino se reutilizan; los nuevos quedan en draft.
 */
import pc from 'picocolors';
import type { CliArgs } from '../cli-args.ts';
import { fetchAssets } from '../contentful/read.ts';
import { applyAssets } from '../execute.ts';
import { selectAssetIds } from '../selection/assets.ts';
import { printTitle } from '../ui/header.ts';
import { withStatus } from '../ui/status.ts';
import { renderAssets } from '../ui/views/assets.ts';
import { confirmWriting, finishDryRun, finishReading, finishWriting, openContext, startWriting } from './context.ts';

export async function migrateAssets(args: CliArgs): Promise<number> {
  printTitle('Migrar imágenes y archivos', { dryRun: args.dryRun, note: 'quedan en draft' });
  const ctx = await openContext(args);
  const ids = await selectAssetIds(ctx, args);
  if (!ids.length) return finishReading(ctx, 'No se eligió ningún archivo.');

  const [srcAssets, dstAssets, srcLocales, dstLocales] = await withStatus(
    'Revisando los archivos en ambos ambientes…',
    ctx.animate,
    () =>
      Promise.all([
        fetchAssets(ctx.cma, ctx.src, ids),
        fetchAssets(ctx.cma, ctx.dst, ids),
        ctx.locales(ctx.src),
        ctx.locales(ctx.dst),
      ]),
    ([, dst]) => `${dst.size} de ${ids.length} ya existen en ${ctx.dst}`,
  );
  const existing = new Set(dstAssets.keys());
  const assets = { ids, src: srcAssets, existing, missing: ids.filter((id) => !existing.has(id) && srcAssets.has(id)) };
  renderAssets({ src: ctx.src, dst: ctx.dst, assets, locales: { src: srcLocales } });

  if (!assets.missing.length) return finishReading(ctx, `Nada que copiar: ya existen en ${ctx.dst}.`);
  if (args.dryRun) return finishDryRun(ctx);
  if (!(await confirmWriting(ctx, `¿Crear ${assets.missing.length} archivo(s) en ${pc.bold(ctx.dst)}?`))) return 0;

  const write = await startWriting(ctx, 'assets');
  await applyAssets(
    assets.missing.flatMap((id) => srcAssets.get(id) ?? []),
    dstLocales,
    write,
  );
  return finishWriting(ctx, write, { title: 'Archivos copiados', done: 'Listo. Los archivos quedaron en draft.' });
}

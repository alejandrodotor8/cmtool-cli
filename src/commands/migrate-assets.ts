/**
 * `cfm migrate-assets`: copia imágenes y archivos sueltos (sin entries). Los que
 * ya existen en destino se reutilizan; los nuevos quedan en draft.
 */

import { type AssetReview, assetMigration } from 'cmtool-core';
import pc from 'picocolors';
import { type CliArgs, repeatCommand } from '../cli-args.ts';
import { selectAssetIds } from '../selection/assets.ts';
import { printTitle } from '../ui/header.ts';
import { log } from '../ui/log.ts';
import { steps } from '../ui/navigation.ts';
import { withStatus } from '../ui/status.ts';
import { renderAssets } from '../ui/views/assets.ts';
import { renderRepeat } from '../ui/views/summary.ts';
import {
  type Context,
  confirmWriting,
  contextSteps,
  finishDryRun,
  finishReading,
  finishWriting,
  startWriting,
} from './context.ts';

export async function migrateAssets(args: CliArgs): Promise<number> {
  printTitle('Migrar imágenes y archivos', { dryRun: args.dryRun, note: 'quedan en draft' });
  const context = contextSteps(args);
  let ctx: Context;
  let ids: string[] = [];
  let review: AssetReview;
  const repeat = () => repeatCommand('migrate-assets', { spaceId: ctx.spaceId, src: ctx.src, dst: ctx.dst, ids });

  const code = await steps([
    ...context.steps,
    async () => {
      ctx = context.ctx();
      ids = await selectAssetIds(ctx, args);
      if (!ids.length) return finishReading(ctx, 'No se eligió ningún archivo.');
    },
    async () => {
      review = await withStatus(
        'Revisando los archivos en ambos ambientes…',
        ctx.animate,
        (status) => assetMigration(ctx.space, ctx).analyze(ids, status.update),
        ({ assets }) => `${assets.existing.size} de ${ids.length} ya existen en ${ctx.dst}`,
      );
      renderAssets(review);
      if (review.isEmpty) return finishReading(ctx, `Nada que copiar: ya existen en ${ctx.dst}.`);
      const { toCreate, assets } = review;

      log.step('Resumen');
      log.block(
        [
          `${pc.bold('Se crean')}        ${pc.green(`${toCreate.length} archivo(s) en ${ctx.dst}`)} ${pc.dim('(en draft)')}`,
          `${pc.bold('Se reutilizan')}   ${assets.existing.size} que ya existen`,
        ].join('\n'),
      );
      if (args.dryRun) return finishDryRun(ctx, ['Para copiarlos de verdad:', pc.cyan(repeat())]);
      renderRepeat(repeat());
      if (!(await confirmWriting(ctx, `¿Crear ${toCreate.length} archivo(s) en ${pc.bold(ctx.dst)}?`))) return 0;
    },
    async () => {
      const write = await startWriting(ctx, 'assets');
      await review.execute(write);
      return finishWriting(ctx, write, {
        title: 'Archivos copiados',
        repeat: repeat(),
        done: 'Listo. Los archivos quedaron en draft.',
      });
    },
  ]);
  return code ?? 0;
}

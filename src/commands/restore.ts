/**
 * `cfm restore`: deshace una ejecución con su respaldo.
 * Devuelve las entries actualizadas a como estaban. Lo que se creó no se borra (la
 * herramienta nunca borra): solo se lista.
 */
import path from 'node:path';
import { AbortError, type BackupData, backupOwner, backupRestore, OWNER, type RestoreReview } from 'cmtool-core';
import { listBackups, readBackup } from 'cmtool-core/node';
import pc from 'picocolors';
import { APP_NAME } from '../app.ts';
import type { CliArgs } from '../cli-args.ts';
import { printTitle } from '../ui/header.ts';
import { log } from '../ui/log.ts';
import { steps } from '../ui/navigation.ts';
import { pickBackup } from '../ui/prompts.ts';
import { withStatus } from '../ui/status.ts';
import { renderRestore } from '../ui/views/restore.ts';
import { renderRepeat } from '../ui/views/summary.ts';
import {
  buildContext,
  type Context,
  confirmWriting,
  finishDryRun,
  finishReading,
  finishWriting,
  openSession,
  startWriting,
} from './context.ts';

export async function restore(args: CliArgs): Promise<number> {
  printTitle('Deshacer una migración', { dryRun: args.dryRun });
  const base = openSession(args);
  let file = '';
  let data: BackupData;
  let ctx: Context;
  let review: RestoreReview;

  const code = await steps([
    async () => {
      const account = await base.account();
      file = args.file ? path.resolve(args.file) : await pickBackup(listBackups(account));
      data = readBackup(file);

      // Un respaldo solo lo restaura la cuenta que lo hizo.
      const owner = backupOwner(data, account);
      if (owner === OWNER.OTHER) {
        throw new AbortError(
          `Este respaldo lo hizo otra cuenta (${data.account?.email ?? data.account?.userId}, ${data.account?.host}).`,
          'Para restaurarlo, inicia sesión con esa cuenta: contentful login',
        );
      }
      if (owner === OWNER.LEGACY)
        log.warn('Este respaldo es anterior y no registra qué cuenta lo hizo: revisa que sea tuyo.');
    },
    async () => {
      const space = base.contentful.space(data.spaceId);
      const [found, envs] = await withStatus(
        `Revisando ${data.dst}…`,
        base.animate,
        (status) => Promise.all([backupRestore(space, data).analyze(status.update), space.environments()]),
        () => `${data.dst} revisado`,
      );
      review = found;
      ctx = buildContext(base, { spaceId: data.spaceId, src: data.src, dst: data.dst, envs });
      renderRestore(data, review.items);

      if (review.isEmpty) return finishReading(ctx, 'No hay entries para restaurar.');
      const { toRestore } = review;
      const repeat = `${APP_NAME} restore ${file}`;
      if (args.dryRun) return finishDryRun(ctx, ['Para restaurar de verdad:', pc.cyan(repeat)]);
      renderRepeat(repeat);
      if (!(await confirmWriting(ctx, `¿Restaurar ${toRestore.length} entry(s) en ${pc.bold(data.dst)}?`))) return 0;
    },
    async () => {
      // El restore también se respalda, así que se puede deshacer.
      const write = await startWriting(ctx, 'restore');
      await review.execute(write);
      return finishWriting(ctx, write, { title: 'Restore listo', done: 'Listo.' });
    },
  ]);
  return code ?? 0;
}

/**
 * `cfm restore`: deshace una ejecución con su respaldo.
 * Devuelve las entries actualizadas a como estaban. Lo que se creó no se borra (la
 * herramienta nunca borra): solo se lista.
 */
import path from 'node:path';
import pc from 'picocolors';
import { listBackups, readBackup } from '../backup.ts';
import type { CliArgs } from '../cli-args.ts';
import { createCma } from '../contentful/client.ts';
import { fetchEntries, listEnvironments } from '../contentful/read.ts';
import { restoreStatus, shouldRestore } from '../core/restore.ts';
import { printTitle } from '../ui/header.ts';
import { pickBackup } from '../ui/prompts.ts';
import { withStatus } from '../ui/status.ts';
import { renderRestore } from '../ui/views/restore.ts';
import {
  buildContext,
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
  const data = readBackup(args.file ? path.resolve(args.file) : await pickBackup(listBackups()));
  const cma = createCma(base.session, data.spaceId, base.api.onRequest);

  const [current, envs] = await withStatus(
    `Revisando ${data.dst}…`,
    base.animate,
    () =>
      Promise.all([
        fetchEntries(
          cma,
          data.dst,
          data.updated.map((e) => e.id),
        ),
        listEnvironments(cma),
      ]),
    () => `${data.dst} revisado`,
  );
  const ctx = buildContext(base, { cma, spaceId: data.spaceId, src: data.src, dst: data.dst, envs });
  const items = data.updated.map((saved) => ({ saved, current: current.get(saved.id) }));
  const toRestore = items.filter((i) => shouldRestore(restoreStatus(i.saved, i.current)));
  renderRestore(data, items);

  if (!toRestore.length) return finishReading(ctx, 'No hay entries para restaurar.');
  if (args.dryRun) return finishDryRun(ctx);
  if (!(await confirmWriting(ctx, `¿Restaurar ${toRestore.length} entry(s) en ${pc.bold(data.dst)}?`))) return 0;

  // El restore también se respalda, así que se puede deshacer.
  const write = startWriting(ctx, 'restore');
  write.runner.start('Restaurando', toRestore.length);
  for (const { saved } of toRestore) {
    await write.runner.run(`${saved.title} ${pc.dim(saved.id)}`, async () => {
      await write.writer.updateEntry(
        saved.id,
        () => saved.fields,
        saved.tags,
        (entry) => write.backup.recordUpdate(entry, saved.title),
      );
      write.backup.confirmUpdate(saved.id);
    });
  }
  write.runner.end();
  return finishWriting(ctx, write, { title: 'Restore listo', done: 'Listo.' });
}

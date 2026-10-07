/**
 * `ctf-migrate restore`: deshace una migración con su respaldo.
 * Devuelve las entries actualizadas a como estaban. Lo que la migración creó no se
 * borra (la herramienta nunca borra): solo se lista.
 */
import path from 'node:path';
import pc from 'picocolors';
import { listBackups, readBackup, startBackup } from '../backup.ts';
import type { CliArgs } from '../cli-args.ts';
import { createCma } from '../contentful/client.ts';
import { fetchEntries, listEnvironments } from '../contentful/read.ts';
import { createWriter } from '../contentful/write.ts';
import { restoreStatus, shouldRestore } from '../core/restore.ts';
import { loadSession } from '../session.ts';
import { trackApiCalls } from '../ui/api-calls.ts';
import { printCancelled, printHeader, printNote, printOutro, type RunMode, shouldAnimate } from '../ui/header.ts';
import { confirmWrite, pickBackup } from '../ui/prompts.ts';
import { createRunner } from '../ui/runner.ts';
import { withStatus } from '../ui/status.ts';
import { renderRestore } from '../ui/views.ts';

export async function restore({ dryRun, file, verbose }: CliArgs, mode: RunMode): Promise<number> {
  printHeader('Contentful · deshacer una migración', { dryRun, mode });

  const session = loadSession();
  const backupFile = file ? path.resolve(file) : await pickBackup(listBackups());
  const data = readBackup(backupFile);
  const api = trackApiCalls(verbose);
  const animate = shouldAnimate(verbose);
  const cma = createCma(session, data.spaceId, api.onRequest);

  const current = await withStatus(
    `Revisando ${data.dst}…`,
    animate,
    () =>
      fetchEntries(
        cma,
        data.dst,
        data.updated.map((e) => e.id),
      ),
    () => `${data.dst} revisado`,
  );
  const items = data.updated.map((saved) => ({ saved, current: current.get(saved.id) }));
  const toRestore = items.filter((i) => shouldRestore(restoreStatus(i.saved, i.current)));
  renderRestore(data, items);

  if (!toRestore.length) {
    printOutro('No hay entries para restaurar.');
    return 0;
  }
  if (dryRun) {
    printNote([pc.dim(`Llamadas a la API: ${api.count}`)], 'Modo --dry-run');
    printOutro('No se escribió nada.');
    return 0;
  }

  const envs = await listEnvironments(cma);
  const dstEnv = envs.find((e) => e.id === data.dst) ?? { id: data.dst, aliases: [] };
  if (!(await confirmWrite(dstEnv, `¿Restaurar ${toRestore.length} entry(s) en ${pc.bold(data.dst)}?`))) {
    printCancelled();
    return 0;
  }

  // El restore también se respalda, así que se puede deshacer.
  const backup = startBackup({ kind: 'restore', spaceId: data.spaceId, src: data.src, dst: data.dst, rootIds: [] });
  const writer = createWriter(cma, { src: data.src, dst: data.dst });
  const { start, run, end, failures } = createRunner({ animate });

  start('Restaurando', toRestore.length);
  for (const { saved } of toRestore) {
    await run(`${saved.title} ${pc.dim(saved.id)}`, async () => {
      await writer.updateEntry(
        saved.id,
        () => saved.fields,
        saved.tags,
        (entry) => backup.recordUpdate(entry, saved.title),
      );
      backup.confirmUpdate(saved.id);
    });
  }
  end();

  printNote(
    [`${pc.bold('Respaldo de este restore')}  ${backup.file}`, `${pc.bold('Llamadas API')}              ${api.count}`],
    failures.length ? 'Terminado con errores' : 'Restore listo',
  );
  printOutro(failures.length ? pc.red(`Terminado con ${failures.length} error(es).`) : pc.green('Listo.'));
  return failures.length ? 1 : 0;
}

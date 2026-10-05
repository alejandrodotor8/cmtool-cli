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
import { RESTORE, restoreStatus } from '../core/restore.ts';
import { loadSession } from '../session.ts';
import { trackApiCalls } from '../ui/api-calls.ts';
import { log } from '../ui/log.ts';
import { confirmWrite, pickBackup } from '../ui/prompts.ts';
import { createRunner } from '../ui/runner.ts';
import { renderRestore } from '../ui/views.ts';

export async function restore({ dryRun, file, verbose }: CliArgs): Promise<number> {
  console.log(
    pc.bold('\nContentful · deshacer una migración') + pc.dim(dryRun ? '  (--dry-run: no se escribe nada)' : ''),
  );

  const session = loadSession();
  const backupFile = file ? path.resolve(file) : await pickBackup(listBackups());
  const data = readBackup(backupFile);
  const api = trackApiCalls(verbose);
  const cma = createCma(session, data.spaceId, api.onRequest);

  log.step(`Revisando ${pc.bold(data.dst)}…`);
  const current = await fetchEntries(
    cma,
    data.dst,
    data.updated.map((e) => e.id),
  );
  const items = data.updated.map((saved) => ({ saved, current: current.get(saved.id) }));
  const toRestore = items.filter((i) => restoreStatus(i.saved, i.current) !== RESTORE.MISSING);
  renderRestore(data, items);

  if (!toRestore.length) {
    log.info('No hay entries para restaurar.');
    return 0;
  }
  if (dryRun) {
    log.step('Modo --dry-run: no se escribió nada.');
    log.info(`Llamadas a la API: ${api.count}`);
    return 0;
  }

  const envs = await listEnvironments(cma);
  const dstEnv = envs.find((e) => e.id === data.dst) ?? { id: data.dst, aliases: [] };
  if (!(await confirmWrite(dstEnv, `¿Restaurar ${toRestore.length} entry(s) en ${pc.bold(data.dst)}?`))) {
    console.log(pc.dim('\nCancelado.'));
    return 0;
  }

  // El restore también se respalda, así que se puede deshacer.
  const backup = startBackup({ kind: 'restore', spaceId: data.spaceId, src: data.src, dst: data.dst, rootIds: [] });
  const writer = createWriter(cma, { src: data.src, dst: data.dst });
  const { run, failures } = createRunner();

  log.step('Restaurando');
  for (const { saved } of toRestore) {
    await run(`${saved.title} ${pc.dim(saved.id)} restaurada`, () =>
      writer.updateEntry(
        saved.id,
        () => saved.fields,
        saved.tags,
        (entry) => backup.recordUpdate(entry, saved.title),
      ),
    );
  }

  log.step(failures.length ? `Terminado con ${failures.length} error(es)` : 'Listo.');
  log.info(`Respaldo de este restore: ${backup.file}`);
  log.info(`Llamadas a la API: ${api.count}`);
  return failures.length ? 1 : 0;
}

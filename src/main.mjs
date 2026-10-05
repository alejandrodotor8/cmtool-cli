/**
 * Flujo completo de ctf-migrate, de principio a fin:
 *   1. elegir space, origen, destino y entries;
 *   2. analizar (solo lectura);
 *   3. mostrar y decidir (imágenes, modelo);
 *   4. confirmar y escribir en destino.
 * Devuelve el código de salida.
 */
import pc from 'picocolors';
import { AbortError } from './errors.mjs';
import { loadSession } from './session.mjs';
import { createCma } from './contentful/client.mjs';
import { listEnvironments, listSpaces } from './contentful/read.mjs';
import { createWriter } from './contentful/write.mjs';
import { analyze } from './analyze.mjs';
import { executePlan } from './execute.mjs';
import { buildPlan, modelOptions } from './core/plan.mjs';
import { log } from './ui/log.mjs';
import { renderAssets, renderEntryTree, renderModel, renderSummary } from './ui/views.mjs';
import {
  askEntryIds,
  askModelChanges,
  askWithAssets,
  confirmMigration,
  pickEnvironments,
  pickSpace,
} from './ui/prompts.mjs';

export async function main() {
  console.log(pc.bold('\nContentful · migrar entries entre ambientes') + pc.dim('  (entries e imágenes quedan en draft)'));

  // 1. Qué migrar y hacia dónde
  const session = loadSession();
  const spaces = await listSpaces(createCma(session));
  if (!spaces.length) throw new AbortError('Tu usuario no tiene acceso a ningún space.');
  const spaceId = await pickSpace(spaces, session.defaultSpaceId);
  const cma = createCma(session, spaceId);

  const envs = await listEnvironments(cma);
  if (envs.length < 2) throw new AbortError('Este space tiene un solo ambiente; no hay a dónde migrar.');
  const { src, dst } = await pickEnvironments(envs);
  const rootIds = await askEntryIds();

  // 2. Análisis (solo lectura)
  log.step(`Analizando ${pc.bold(src)} ${pc.dim('──▶')} ${pc.bold(dst)}…`);
  const analysis = await analyze(cma, { src, dst, rootIds });

  // 3. Mostrar y decidir
  renderEntryTree(analysis);

  let withAssets = false;
  if (analysis.assets.ids.length) {
    renderAssets(analysis);
    const missing = analysis.assets.missing.length;
    if (missing) {
      withAssets = await askWithAssets(missing);
      if (!withAssets) {
        log.warn(`Las entries quedarán apuntando a ${missing} imagen(es) que no existen en ${dst}; no se podrán publicar hasta que existan.`);
      }
    }
  }

  renderModel(analysis);
  const options = modelOptions(analysis);
  const picked = options.length ? await askModelChanges(options, dst) : [];

  const plan = buildPlan(analysis, { withAssets, picked });
  renderSummary(analysis, plan);
  if (!plan.entries.length) throw new AbortError('No queda nada para migrar.');

  // 4. Confirmar y escribir
  if (!(await confirmMigration(envs.find((e) => e.id === dst)))) {
    console.log(pc.dim('\nCancelado.'));
    return 0;
  }
  const failures = await executePlan(plan, analysis, createWriter(cma, { src, dst }));

  log.step(failures.length ? `Terminado con ${failures.length} error(es)` : 'Listo. Ninguna entry ni imagen fue publicada.');
  for (const id of rootIds) {
    log.info(`https://${session.appHost}/spaces/${spaceId}/environments/${dst}/entries/${id}`);
  }
  return failures.length ? 1 : 0;
}

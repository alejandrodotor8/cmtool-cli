import pc from 'picocolors';
import type { Analysis } from '../../analyze.ts';
import { countEditorFields, countNewFields, hasModelChanges, type ModelChanges } from '../../core/model-changes.ts';
import { ACTION, type Plan } from '../../core/plan.ts';
import type { RequiredGap } from '../../core/publish-check.ts';
import { log } from '../log.ts';
import { clip, table } from '../table.ts';
import { countActions } from './entries.ts';
import { route } from './shared.ts';

/** Caja final con todo lo que va a pasar, antes de confirmar la migración de entries. */
export function renderSummary(
  { src, dst, actions, assets, locales, tree, titleOf }: Analysis,
  plan: Plan,
  { gaps, hyperlinks }: { gaps: Map<string, RequiredGap[]>; hyperlinks: Map<string, string[]> },
): void {
  log.step('Resumen');
  const created = plan.entries.filter((e) => e.action === ACTION.CREATE).length;
  const reused = countActions(actions, ACTION.REUSE);

  const rows: [string, string][] = [
    ['Entries', `${pc.green(`${created} se crean`)} · ${pc.yellow(`${plan.entries.length - created} se actualizan`)}`],
  ];
  const kept = countActions(actions, ACTION.KEEP);
  if (kept) rows.push(['', pc.dim(`${kept} elegida(s) ya existen en ${dst} y no se actualizan`)]);
  if (reused) rows.push(['', pc.cyan(`${reused} hijo(s) ya existen en ${dst} → se reutilizan sin tocarlos`)]);
  if (plan.skipped.length) {
    rows.push(['', pc.red(`${plan.skipped.length} no se migran (content type no existe en ${dst})`)]);
  }
  if (plan.archived.length) rows.push(['', pc.red(`${plan.archived.length} no se tocan (archivadas en ${dst})`)]);
  rows.push(['Modelo', modelSummary(plan)]);
  if (plan.notAdded.length) rows.push(['', pc.dim(`no se migran: ${clip(plan.notAdded.join(', '), 70)}`)]);
  if (assets.ids.length) {
    rows.push([
      'Imágenes',
      plan.withAssets
        ? `${pc.green(`${assets.missing.length} se crean`)} · ${assets.existing.size} se reutilizan`
        : `${assets.existing.size} se reutilizan${assets.missing.length ? pc.red(` · ${assets.missing.length} no se crean`) : ''}`,
    ]);
  }
  if (plan.tagsToCreate.length) rows.push(['Tags', pc.green(`${plan.tagsToCreate.length} se crean`)]);
  if (locales.missing.length) rows.push(['Locales', pc.dim(`se omiten: ${locales.missing.join(', ')}`)]);

  table({
    title: `${route(src, dst)}  ${pc.dim('entries e imágenes quedan en draft')}`,
    columns: [{}, {}],
    rows: rows.map(([label, value]) => [pc.bold(label), value]),
  });
  if (plan.skipped.length) log.warn(`Quien use estas entries quedará con links rotos: ${plan.skipped.join(', ')}`);

  const nameOf = (id: string) => {
    const entry = tree.entries.get(id);
    return `${clip(entry ? titleOf(entry) : id)} ${id}`;
  };
  if (hyperlinks.size) {
    log.warn(`Hay textos enlazados a entries que no existen en ${dst}: esos enlaces quedarán rotos.`);
    for (const [id, targets] of hyperlinks) log.info(`${nameOf(id)}: ${targets.join(', ')}`);
  }
  if (gaps.size) {
    log.warn(
      `${gaps.size} entry(s) quedarán en ${dst} con campos obligatorios vacíos: no se podrán publicar hasta completarlos.`,
    );
    const onlyDefault = locales.dst.required.size <= 1;
    for (const [id, entryGaps] of gaps) {
      const fields = entryGaps.map((g) => (onlyDefault ? g.field.name : `${g.field.name} (${g.locales.join(', ')})`));
      log.info(`${nameOf(id)}: ${fields.join(', ')}`);
    }
  }
}

/**
 * "+1 content type(s) · +2 campo(s) (se publica el modelo)" o "sin cambios". Copiar la
 * apariencia del editor no publica el modelo.
 */
export function modelSummary(changes: ModelChanges): string {
  if (!hasModelChanges(changes)) return pc.dim('sin cambios');
  const structure = changes.contentTypesToCreate.length + changes.fieldsToAdd.size > 0;
  const parts = [
    changes.contentTypesToCreate.length && `+${changes.contentTypesToCreate.length} content type(s)`,
    countNewFields(changes) && `+${countNewFields(changes)} campo(s)`,
    countEditorFields(changes) && `help text y widget de ${countEditorFields(changes)} campo(s)`,
  ].filter(Boolean);
  return pc.yellow(parts.join(' · ')) + (structure ? pc.dim(' (se publica el modelo)') : '');
}

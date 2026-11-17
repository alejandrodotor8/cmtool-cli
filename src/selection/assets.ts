/**
 * Elegir assets (imágenes y archivos) de origen: por ID/URL o buscando por texto.
 */

import { LIMITS, searchAssets } from 'cmtool-core';
import type { CliArgs } from '../cli-args.ts';
import type { Context } from '../commands/context.ts';
import { log } from '../ui/log.ts';
import { goBack, steps } from '../ui/navigation.ts';
import { askIds, askText, choose, chooseMany } from '../ui/prompts.ts';
import { withStatus } from '../ui/status.ts';
import { clip } from '../ui/table.ts';

export async function selectAssetIds(ctx: Context, args: Pick<CliArgs, 'ids' | 'search'>): Promise<string[]> {
  if (args.ids) return args.ids;
  if (args.search) return searchAssetsAndPick(ctx, args.search, { preselect: true });

  let method = 'ids';
  let ids: string[] = [];
  await steps([
    async () => {
      method = await choose('¿Cómo eliges los archivos?', [
        { value: 'ids', label: 'Por asset ID o URL', hint: 'sin llamadas extra' },
        { value: 'search', label: 'Buscar por nombre', hint: '1 llamada por búsqueda' },
      ]);
    },
    async () => {
      if (method === 'ids') {
        ids = await askIds('assets');
        return;
      }
      let text = '';
      await steps([
        async () => {
          text = await askText('Buscar', { validate: (v) => (v ? undefined : 'Escribe algo para buscar.') });
        },
        async () => {
          ids = await searchAssetsAndPick(ctx, text, { preselect: false });
          if (!ids.length) goBack();
        },
      ]);
    },
  ]);
  return ids;
}

/** Busca archivos por texto (una llamada) y deja elegir entre los resultados. */
async function searchAssetsAndPick(ctx: Context, text: string, { preselect }: { preselect: boolean }) {
  const results = await withStatus(
    `Buscando en ${ctx.src}…`,
    ctx.animate,
    () => searchAssets(ctx.cma, ctx.src, text, LIMITS.searchResults),
    (found) => `${found.length} resultado(s)`,
  );
  if (!results.length) {
    log.warn(`No hay archivos que coincidan con "${text}".`);
    return [];
  }
  return chooseMany(
    'Elige los archivos',
    results.map((a) => {
      const file = Object.values(a.fields.file ?? {})[0];
      const title = Object.values(a.fields.title ?? {})[0];
      return {
        value: a.sys.id,
        label: clip(title ?? file?.fileName ?? a.sys.id, 50),
        hint: `${file?.contentType ?? ''} · ${a.sys.id}`,
      };
    }),
    { initialValues: preselect ? results.map((a) => a.sys.id) : [] },
  );
}

/**
 * Elegir entries de origen: por ID, buscando, recientes, por tag, desde un archivo o las
 * que faltan en destino. Lo usan "migrar entries" y "comparar entries".
 * Las búsquedas se resuelven en el servidor: una llamada por búsqueda.
 */
import fs from 'node:fs';
import {
  AbortError,
  contentTypeOf,
  type Entry,
  type EntryQuery,
  entryQueryParams,
  fetchEntries,
  isEmptyQuery,
  LIMITS,
  listEntries,
  makeTitleOf,
  parseEntryIds,
  readTags,
  searchEntries,
} from 'cmtool-core';
import type { CliArgs } from '../cli-args.ts';
import type { Context } from '../commands/context.ts';
import { log } from '../ui/log.ts';
import { goBack, steps } from '../ui/navigation.ts';
import {
  askFile,
  askIds,
  askSince,
  askText,
  askYesNo,
  type Choice,
  choose,
  chooseMany,
  pickContentType,
  search,
} from '../ui/prompts.ts';
import { withStatus } from '../ui/status.ts';
import { clip } from '../ui/table.ts';
import { formatDate } from '../ui/views/shared.ts';

type Method = 'ids' | 'search' | 'content-type' | 'recent' | 'tag' | 'file' | 'missing';

/** Formas de elegir, con lo que cuesta cada una en llamadas a la API. */
const METHODS: Choice<Method>[] = [
  { value: 'ids', label: 'Por entry ID o URL', hint: 'pegar uno o varios · sin llamadas extra · lo más directo' },
  { value: 'search', label: 'Buscar por texto', hint: '1 llamada por búsqueda' },
  { value: 'content-type', label: 'Por content type', hint: 'eliges el tipo y, si quieres, un texto · 1 llamada' },
  {
    value: 'recent',
    label: 'Cambiadas recientemente',
    hint: 'desde una fecha, opcional solo las tuyas · 1–2 llamadas',
  },
  { value: 'tag', label: 'Por tag', hint: '2 llamadas' },
  { value: 'file', label: 'Desde un archivo', hint: 'lista de IDs (txt o csv) · sin llamadas extra' },
  {
    value: 'missing',
    label: 'Las que faltan en destino',
    hint: `por content type · 1 llamada por cada ${LIMITS.missingPageSize} entries, más la verificación`,
  },
];

/**
 * Entry IDs a usar. Con flags no pregunta cómo elegir; sin flags, pregunta.
 * Devuelve `[]` si no se encontró o no se eligió nada.
 */
export async function selectEntryIds(
  ctx: Context,
  args: CliArgs,
  { allowMissing = true }: { allowMissing?: boolean } = {},
): Promise<string[]> {
  if (args.ids) return args.ids;
  if (args.idsFile) return idsFromFile(args.idsFile);
  if (args.missing) return missingInDst(ctx, args.contentTypes?.[0], args.since);

  const flagQuery: EntryQuery = {
    text: args.search,
    contentTypes: args.contentTypes,
    tag: args.tag,
    since: args.since,
    updatedBy: args.mine ? await myUserId(ctx) : undefined,
  };
  if (!isEmptyQuery(flagQuery)) return pickFromSearch(ctx, flagQuery, { preselect: true });

  const methods = allowMissing ? METHODS : METHODS.filter((m) => m.value !== 'missing');
  let method: Method = 'ids';
  let ids: string[] = [];
  await steps([
    async () => {
      method = await choose('¿Cómo eliges las entries?', methods);
    },
    async () => {
      ids = await byMethod(ctx, method);
    },
  ]);
  return ids;
}

/** Las preguntas de cada forma de elegir (Esc vuelve a la anterior, y de la primera a elegir la forma). */
async function byMethod(ctx: Context, method: Method): Promise<string[]> {
  let ids: string[] = [];
  switch (method) {
    case 'ids':
      return askIds('entries');
    case 'file':
      return idsFromFile(await askFile('Archivo con los entry IDs'));
    case 'search':
      return searchAndPick(ctx, {}, { textRequired: true });
    case 'content-type': {
      let contentType = '';
      await steps([
        async () => {
          contentType = await pickContentType((await ctx.space.contentTypes(ctx.src)).values());
        },
        async () => {
          ids = await searchAndPick(ctx, { contentTypes: [contentType] }, { textRequired: false });
        },
      ]);
      return ids;
    }
    case 'recent': {
      let since = '';
      let mine = false;
      await steps([
        async () => {
          since = await askSince();
        },
        async () => {
          mine = await askYesNo('¿Solo las que editaste tú?', false);
        },
        async () => {
          const query = { since, updatedBy: mine ? await myUserId(ctx) : undefined };
          ids = await pickFromSearch(ctx, query, { preselect: false });
        },
      ]);
      return ids;
    }
    case 'tag': {
      let tag = '';
      await steps([
        async () => {
          tag = await pickTag(ctx);
        },
        async () => {
          ids = await pickFromSearch(ctx, { tag }, { preselect: false });
        },
      ]);
      return ids;
    }
    case 'missing':
      return missingInDst(ctx, undefined, undefined);
  }
}

/** IDs de un archivo (txt, csv o lo que se copió de Excel). */
function idsFromFile(file: string): string[] {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    throw new AbortError(`No pude leer el archivo ${file}.`);
  }
  const { ids, invalid } = parseEntryIds(text);
  if (invalid.length) {
    throw new AbortError(`El archivo tiene valores que no son entry IDs: ${clip(invalid.join(', '), 80)}`);
  }
  log.info(`${ids.length} entry ID(s) leídos de ${file}`);
  return ids;
}

/** "Solo las mías": la cuenta ya se consulta una sola vez por ejecución. */
const myUserId = async (ctx: Context) => (await ctx.account()).userId;

async function pickTag(ctx: Context): Promise<string> {
  const tags = await withStatus(
    `Leyendo tags de ${ctx.src}…`,
    ctx.animate,
    () => readTags(ctx.space.cma, ctx.src),
    (found) => `${found.size} tag(s)`,
  );
  if (!tags.size) throw new AbortError(`${ctx.src} no tiene tags.`);
  return search(
    'Tag',
    [...tags.values()].map((t) => ({ value: t.sys.id, label: t.name, hint: t.sys.id })),
  );
}

/** Pregunta un texto, busca y deja elegir; sin resultados, vuelve a preguntar el texto. */
async function searchAndPick(
  ctx: Context,
  base: EntryQuery,
  { textRequired }: { textRequired: boolean },
): Promise<string[]> {
  let text = '';
  let ids: string[] = [];
  await steps([
    async () => {
      text = await askText(textRequired ? 'Buscar' : 'Filtrar por texto (opcional)', {
        placeholder: textRequired ? 'Parte del título o del contenido' : 'Vacío: las más recientes de ese tipo',
        validate: (v) => (textRequired && !v ? 'Escribe algo para buscar.' : undefined),
      });
    },
    async () => {
      ids = await pickFromSearch(ctx, { ...base, text: text || undefined }, { preselect: false });
      if (!ids.length) {
        log.warn('Sin resultados. Prueba con otro texto.');
        goBack();
      }
    },
  ]);
  return ids;
}

/** Opciones para elegir entries: título, content type, ID y fecha de última edición. */
async function entryChoices(ctx: Context, entries: Entry[]): Promise<Choice<string>[]> {
  const cts = await ctx.space.contentTypes(ctx.src);
  const titleOf = makeTitleOf(cts, (await ctx.space.locales(ctx.src)).default);
  return entries.map((e) => ({
    value: e.sys.id,
    label: clip(titleOf(e), 50),
    hint: `${cts.get(contentTypeOf(e))?.name ?? contentTypeOf(e)} · ${e.sys.id} · ${formatDate(e.sys.updatedAt)}`,
  }));
}

/** Una búsqueda (una llamada) y elegir entre los resultados. */
async function pickFromSearch(
  ctx: Context,
  query: EntryQuery,
  { preselect }: { preselect: boolean },
): Promise<string[]> {
  const results = await withStatus(
    `Buscando en ${ctx.src}…`,
    ctx.animate,
    () => searchEntries(ctx.space.cma, ctx.src, entryQueryParams(query, LIMITS.searchResults)),
    (found) => `${found.length} resultado(s)`,
  );
  if (!results.length) return [];
  if (results.length === LIMITS.searchResults) {
    log.warn(`Se muestran las ${LIMITS.searchResults} más recientes: afina la búsqueda si no está la que buscas.`);
  }
  const choices = await entryChoices(ctx, results);
  return chooseMany('Elige las entries', choices, { initialValues: preselect ? choices.map((c) => c.value) : [] });
}

/**
 * Las entries de un content type que están en origen y no en destino. Recorre origen por
 * páginas (con tope) y verifica en destino solo esos IDs.
 */
async function missingInDst(ctx: Context, contentType: string | undefined, since: string | undefined) {
  const cts = await ctx.space.contentTypes(ctx.src);
  let ids: string[] = [];
  let ctId = contentType ?? '';
  await steps([
    async () => {
      ctId = contentType ?? (await pickContentType(cts.values(), 'Content type a revisar'));
      if (!cts.has(ctId)) throw new AbortError(`El content type "${ctId}" no existe en ${ctx.src}.`);
    },
    async () => {
      ids = await pickMissing(ctx, ctId, since);
    },
  ]);
  return ids;
}

/** Las entries de un content type que faltan en destino, para elegir cuáles migrar. */
async function pickMissing(ctx: Context, ctId: string, since: string | undefined): Promise<string[]> {
  const srcEntries = await withStatus(
    `Leyendo ${ctId} en ${ctx.src}…`,
    ctx.animate,
    () =>
      listEntries(ctx.space.cma, ctx.src, entryQueryParams({ contentTypes: [ctId], since }, LIMITS.missingPageSize), {
        pageSize: LIMITS.missingPageSize,
        max: LIMITS.missingMaxEntries,
      }),
    (found) => `${found.length} entries en ${ctx.src}`,
  );
  const inDst = await withStatus(
    `Verificando cuáles existen en ${ctx.dst}…`,
    ctx.animate,
    () =>
      fetchEntries(
        ctx.space.cma,
        ctx.dst,
        srcEntries.map((e) => e.sys.id),
      ),
    (found) => `${found.size} ya existen en ${ctx.dst}`,
  );
  const missing = srcEntries.filter((e) => !inDst.has(e.sys.id));
  if (!missing.length) {
    log.ok(`No falta ninguna entry de "${ctId}" en ${ctx.dst}.`);
    return [];
  }
  const choices = await entryChoices(ctx, missing);
  return chooseMany(`Faltan ${missing.length} en ${ctx.dst}: elige cuáles migrar`, choices, {
    initialValues: choices.map((c) => c.value),
  });
}

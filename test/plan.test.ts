import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Entry } from '../src/contentful/types.ts';
import { ACTION, brokenHyperlinks, buildPlan, changedInDst, classifyTree, modelOptions } from '../src/core/plan.ts';
import { analysisOf, asset, contentType, entry, field, link, tag, treeOf, writtenIds } from './fixtures.ts';

describe('classifyTree', () => {
  // banner (pegado, no existe en qa)
  // ├─ store (existe en qa)
  // │  └─ municipio (existe en qa)
  // │     └─ departamento (no existe en qa, cuelga de una reutilizada)
  // └─ slide (no existe en qa)
  //    └─ item (no existe en qa)
  const entries = [
    entry('banner', 'banner', { store: { 'es-CO': link('store') }, slide: { 'es-CO': link('slide') } }),
    entry('store', 'store', { municipio: { 'es-CO': link('municipio') } }),
    entry('municipio', 'municipio', { departamento: { 'es-CO': link('departamento') } }),
    entry('departamento', 'departamento'),
    entry('slide', 'slide', { item: { 'es-CO': link('item') } }),
    entry('item', 'item'),
  ];
  const actions = classifyTree(['banner'], treeOf(entries), new Set(['store', 'municipio']));

  test('lo que pegas y no existe en destino se crea', () => {
    assert.equal(actions.get('banner'), ACTION.CREATE);
  });

  test('los hijos que no existen en destino se crean, en cadena', () => {
    assert.equal(actions.get('slide'), ACTION.CREATE);
    assert.equal(actions.get('item'), ACTION.CREATE);
  });

  test('un hijo que ya existe en destino se reutiliza, igual que lo que tiene debajo', () => {
    assert.equal(actions.get('store'), ACTION.REUSE);
    assert.equal(actions.get('municipio'), ACTION.REUSE);
  });

  test('lo que no existe pero cuelga de un hijo reutilizado no se crea', () => {
    assert.equal(actions.get('departamento'), ACTION.ORPHAN);
  });

  test('lo que pegas y ya existe en destino se actualiza', () => {
    const tree = treeOf([entry('banner', 'banner')]);
    assert.equal(classifyTree(['banner'], tree, new Set(['banner'])).get('banner'), ACTION.UPDATE);
  });

  test('un hijo que también pegaste se actualiza aunque ya exista', () => {
    const tree = treeOf([entry('banner', 'banner', { store: { 'es-CO': link('store') } }), entry('store', 'store')]);
    const result = classifyTree(['banner', 'store'], tree, new Set(['store']));
    assert.equal(result.get('store'), ACTION.UPDATE);
  });

  test('los ciclos no se quedan en un loop', () => {
    const tree = treeOf([
      entry('a', 'x', { b: { 'es-CO': link('b') } }),
      entry('b', 'x', { a: { 'es-CO': link('a') } }),
    ]);
    const result = classifyTree(['a'], tree, new Set());
    assert.equal(result.get('a'), ACTION.CREATE);
    assert.equal(result.get('b'), ACTION.CREATE);
  });
});

describe('modelOptions', () => {
  const banner = contentType('banner', [field('title')]);
  const storeSrc = contentType('store', [field('title'), field('codigo')]);
  const storeDst = contentType('store', [field('title')]);
  const dep = contentType('departamento', [field('title')]);

  const analysis = analysisOf({
    rootIds: ['banner'],
    entries: [
      entry('banner', 'banner', { store: { 'es-CO': link('store') } }),
      entry('store', 'store', { departamento: { 'es-CO': link('dep') } }),
      entry('dep', 'departamento'),
    ],
    existsInDst: ['store'],
    srcCTs: [banner, storeSrc, dep],
    dstCTs: [banner, storeDst],
  });

  test('ofrece campos que faltan aunque solo los usen entries reutilizadas, marcándolo', () => {
    const store = modelOptions(analysis).find((o) => o.diff.id === 'store');
    assert.ok(store);
    assert.equal(store.onlyReused, true);
    assert.deepEqual(
      store.diff.missing.map((f) => f.id),
      ['codigo'],
    );
  });

  test('no ofrece crear un content type que solo usan entries que no se escriben', () => {
    assert.equal(
      modelOptions(analysis).some((o) => o.diff.id === 'departamento'),
      false,
    );
  });

  test('no ofrece content types al día', () => {
    assert.equal(
      modelOptions(analysis).some((o) => o.diff.id === 'banner'),
      false,
    );
  });
});

describe('buildPlan', () => {
  const bannerSrc = contentType('banner', [field('title'), field('subtitle'), field('cta')]);
  const bannerDst = contentType('banner', [field('title')]);
  const promo = contentType('promo', [field('title')]);

  const analysis = analysisOf({
    rootIds: ['banner', 'promo1'],
    entries: [entry('banner', 'banner', { image: { 'es-CO': link('img1', 'Asset') } }), entry('promo1', 'promo')],
    srcCTs: [bannerSrc, promo],
    dstCTs: [bannerDst],
    srcAssets: [asset('img1', { 'es-CO': { url: '//images.ctfassets.net/img1.jpg' } })],
    missingTags: [tag('navidad')],
  });

  test('sin crear su content type, la entry se omite', () => {
    const plan = buildPlan(analysis, { withAssets: false, picked: [] });
    assert.deepEqual(plan.skipped, ['promo1']);
    assert.deepEqual(
      plan.entries.map((e) => e.id),
      ['banner'],
    );
  });

  test('si marcas crear el content type, la entry se migra', () => {
    const plan = buildPlan(analysis, { withAssets: false, picked: [{ ctId: 'promo' }] });
    assert.deepEqual(
      plan.contentTypesToCreate.map((ct) => ct.sys.id),
      ['promo'],
    );
    assert.deepEqual(plan.skipped, []);
    assert.deepEqual(plan.entries.map((e) => e.id).sort(), ['banner', 'promo1']);
  });

  test('agrupa los campos marcados por content type y reporta los que no se marcaron', () => {
    const subtitle = bannerSrc.fields[1];
    assert.ok(subtitle);
    const plan = buildPlan(analysis, { withAssets: false, picked: [{ ctId: 'banner', field: subtitle }] });
    assert.deepEqual(
      plan.fieldsToAdd.get('banner')?.map((f) => f.id),
      ['subtitle'],
    );
    assert.deepEqual(plan.notAdded, ['banner.cta']);
  });

  test('sin imágenes no crea assets; con imágenes crea los que faltan', () => {
    assert.deepEqual(buildPlan(analysis, { withAssets: false, picked: [] }).assetsToCreate, []);
    const plan = buildPlan(analysis, { withAssets: true, picked: [] });
    assert.deepEqual(
      plan.assetsToCreate.map((a) => a.sys.id),
      ['img1'],
    );
  });

  test('crea los tags que faltan', () => {
    const plan = buildPlan(analysis, { withAssets: false, picked: [] });
    assert.deepEqual(
      plan.tagsToCreate.map((t) => t.sys.id),
      ['navidad'],
    );
  });

  test('solo escribe entries del árbol que se crean o actualizan', () => {
    assert.deepEqual(writtenIds(analysis).sort(), ['banner', 'promo1']);
  });
});

const archivedEntry = (id: string, ct: string): Entry => {
  const e = entry(id, ct);
  (e.sys as Entry['sys']).archivedVersion = 2;
  return e;
};

describe('entries archivadas en destino', () => {
  test('una entry que pegaste y está archivada en destino no se actualiza', () => {
    const ct = contentType('banner', [field('title')]);
    const analysis = analysisOf({
      rootIds: ['banner'],
      entries: [entry('banner', 'banner')],
      dstEntries: [archivedEntry('banner', 'banner')],
      srcCTs: [ct],
      dstCTs: [ct],
    });
    const plan = buildPlan(analysis, { withAssets: false, picked: [] });
    assert.deepEqual(plan.archived, ['banner']);
    assert.deepEqual(plan.entries, []);
  });
});

describe('brokenHyperlinks', () => {
  const hyperlinkTo = (id: string) => ({
    'es-CO': { nodeType: 'document', content: [{ nodeType: 'entry-hyperlink', data: { target: link(id) } }] },
  });
  const ct = contentType('banner', [field('title'), field('body', 'RichText')]);

  test('avisa si un texto enlazado apunta a una entry que no existirá en destino', () => {
    const analysis = analysisOf({
      rootIds: ['banner'],
      entries: [entry('banner', 'banner', { body: hyperlinkTo('pagina') })],
      srcCTs: [ct],
      dstCTs: [ct],
    });
    assert.deepEqual(Object.fromEntries(brokenHyperlinks(analysis)), { banner: ['pagina'] });
  });

  test('si la entry enlazada ya existe en destino, no hay aviso', () => {
    const analysis = analysisOf({
      rootIds: ['banner'],
      entries: [entry('banner', 'banner', { body: hyperlinkTo('pagina') })],
      existsInDst: ['pagina'],
      srcCTs: [ct],
      dstCTs: [ct],
    });
    assert.equal(brokenHyperlinks(analysis).size, 0);
  });
});

describe('changedInDst', () => {
  test('detecta entries que aparecieron, desaparecieron o se archivaron', () => {
    const before = new Map([
      ['a', entry('a', 'x')],
      ['b', entry('b', 'x')],
      ['c', entry('c', 'x')],
    ]);
    const after = new Map([
      ['b', entry('b', 'x')],
      ['c', archivedEntry('c', 'x')],
      ['d', entry('d', 'x')],
    ]);
    assert.deepEqual(changedInDst(['a', 'b', 'c', 'd'], before, after), ['a', 'c', 'd']);
  });

  test('si nada cambió, no hay diferencias', () => {
    const state = new Map([['a', entry('a', 'x')]]);
    assert.deepEqual(changedInDst(['a', 'b'], state, new Map(state)), []);
  });
});

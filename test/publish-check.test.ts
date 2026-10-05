import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildPlan } from '../src/core/plan.ts';
import { projectedContentType, requiredGaps, writableFields } from '../src/core/publish-check.ts';
import { analysisOf, contentType, entry, field } from './fixtures.ts';

const gapIds = (gaps: Map<string, { id: string }[]>) =>
  Object.fromEntries([...gaps].map(([id, fields]) => [id, fields.map((f) => f.id)]));

describe('requiredGaps', () => {
  test('una entry nueva con un obligatorio vacío en destino no se podrá publicar', () => {
    const analysis = analysisOf({
      rootIds: ['banner'],
      entries: [entry('banner', 'banner', { title: { 'es-CO': 'Hola' } })],
      srcCTs: [contentType('banner', [field('title'), field('cta')])],
      dstCTs: [contentType('banner', [field('title'), field('cta', 'Symbol', { required: true })])],
    });
    const plan = buildPlan(analysis, { withAssets: false, picked: [] });
    assert.deepEqual(gapIds(requiredGaps(analysis, plan)), { banner: ['cta'] });
  });

  test('al actualizar, cuenta el valor que ya tenía en destino', () => {
    const ct = contentType('banner', [field('title'), field('legal', 'Symbol', { required: true })]);
    const analysis = analysisOf({
      rootIds: ['banner'],
      entries: [entry('banner', 'banner', { title: { 'es-CO': 'Nuevo' } })],
      dstEntries: [entry('banner', 'banner', { title: { 'es-CO': 'Viejo' }, legal: { 'es-CO': 'Términos' } })],
      srcCTs: [contentType('banner', [field('title')])],
      dstCTs: [ct],
    });
    const plan = buildPlan(analysis, { withAssets: false, picked: [] });
    assert.equal(requiredGaps(analysis, plan).size, 0);
  });

  test('un campo obligatorio que se agrega al modelo y viene vacío también cuenta', () => {
    const subtitle = field('subtitle', 'Symbol', { required: true });
    const analysis = analysisOf({
      rootIds: ['banner'],
      entries: [entry('banner', 'banner', { title: { 'es-CO': 'Hola' } })],
      srcCTs: [contentType('banner', [field('title'), subtitle])],
      dstCTs: [contentType('banner', [field('title')])],
    });
    const plan = buildPlan(analysis, { withAssets: false, picked: [{ ctId: 'banner', field: subtitle }] });
    assert.deepEqual(gapIds(requiredGaps(analysis, plan)), { banner: ['subtitle'] });
  });

  test('textos vacíos y listas vacías cuentan como vacíos', () => {
    const analysis = analysisOf({
      rootIds: ['banner'],
      entries: [entry('banner', 'banner', { title: { 'es-CO': '' }, items: { 'es-CO': [] } })],
      srcCTs: [contentType('banner', [field('title'), field('items', 'Array', { items: { type: 'Symbol' } })])],
      dstCTs: [
        contentType('banner', [
          field('title', 'Symbol', { required: true }),
          field('items', 'Array', { required: true, items: { type: 'Symbol' } }),
        ]),
      ],
    });
    const plan = buildPlan(analysis, { withAssets: false, picked: [] });
    assert.deepEqual(gapIds(requiredGaps(analysis, plan)), { banner: ['title', 'items'] });
  });

  test('si todo lo obligatorio tiene valor, no hay avisos', () => {
    const ct = contentType('banner', [field('title', 'Symbol', { required: true })]);
    const analysis = analysisOf({
      rootIds: ['banner'],
      entries: [entry('banner', 'banner', { title: { 'es-CO': 'Hola' } })],
      srcCTs: [ct],
      dstCTs: [ct],
    });
    assert.equal(requiredGaps(analysis, buildPlan(analysis, { withAssets: false, picked: [] })).size, 0);
  });
});

describe('projectedContentType', () => {
  const analysis = analysisOf({
    rootIds: ['banner', 'promo1'],
    entries: [entry('banner', 'banner'), entry('promo1', 'promo')],
    srcCTs: [contentType('banner', [field('title'), field('cta')]), contentType('promo', [field('title')])],
    dstCTs: [contentType('banner', [field('title')])],
  });

  test('un content type que se crea queda como en origen', () => {
    const plan = buildPlan(analysis, { withAssets: false, picked: [{ ctId: 'promo' }] });
    assert.equal(projectedContentType('promo', analysis, plan)?.sys.id, 'promo');
  });

  test('suma los campos que se agregan', () => {
    const cta = field('cta');
    const plan = buildPlan(analysis, { withAssets: false, picked: [{ ctId: 'banner', field: cta }] });
    assert.deepEqual(
      projectedContentType('banner', analysis, plan)?.fields.map((f) => f.id),
      ['title', 'cta'],
    );
  });

  test('si no se crea y no existe en destino, no hay content type', () => {
    const plan = buildPlan(analysis, { withAssets: false, picked: [] });
    assert.equal(projectedContentType('promo', analysis, plan), undefined);
  });
});

describe('writableFields', () => {
  test('no escribe campos que solo existen en destino ni los de otro tipo, así conservan su valor', () => {
    const analysis = analysisOf({
      rootIds: ['banner'],
      entries: [entry('banner', 'banner')],
      srcCTs: [contentType('banner', [field('title'), field('image', 'Link', { linkType: 'Entry' })])],
      dstCTs: [contentType('banner', [field('title'), field('image', 'Link', { linkType: 'Asset' }), field('legal')])],
    });
    const dstCT = analysis.contentTypes.dst.get('banner');
    assert.ok(dstCT);
    assert.deepEqual([...writableFields(dstCT, analysis.diffs.get('banner')).keys()], ['title']);
  });
});

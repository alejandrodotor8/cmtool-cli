import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { VALUE } from '../src/core/entry-compare.ts';
import { compareModels } from '../src/core/model.ts';
import { environmentStatus } from '../src/core/status.ts';
import { entryComparisonReport, mdTable, modelComparisonReport, statusReport } from '../src/report/markdown.ts';
import { reportName } from '../src/report/save.ts';
import { contentType, field, locales } from './fixtures.ts';

const now = new Date(2026, 9, 7);
const envs = { src: 'develop', dst: 'qa' };
const model = compareModels(
  new Map([['banner', contentType('banner', [field('title'), field('cta')])]]),
  new Map([['banner', contentType('banner', [field('title')])]]),
);

describe('mdTable', () => {
  test('arma la tabla y escapa los | y los saltos de línea', () => {
    assert.equal(mdTable(['A', 'B'], [['x|y', 'una\nlínea']]), '| A | B |\n| --- | --- |\n| x\\|y | una línea |');
  });
});

describe('reportes', () => {
  test('comparación de modelos: resumen y diferencias campo por campo', () => {
    const md = modelComparisonReport(model, { ...envs, dstDefault: 'es-CO' }, now);
    assert.match(md, /^# Comparación de modelos: develop → qa/);
    assert.match(md, /\| banner \| banner \| 2 \| 1 falta\(n\) \|/);
    assert.match(md, /\| cta \| cta \| Symbol \| falta en qa \|/);
  });

  test('estado de los ambientes', () => {
    const status = environmentStatus(
      model,
      { src: locales(['es-CO', 'en-US']), dst: locales(['es-CO']) },
      {
        src: new Set(['navidad']),
        dst: new Set(),
      },
    );
    const md = statusReport(status, model, envs, now);
    assert.match(md, /Idiomas que faltan en destino \| en-US/);
    assert.match(md, /Tags que faltan en destino \| navidad/);
  });

  test('comparación de entries', () => {
    const md = entryComparisonReport(
      [
        {
          id: 'b',
          title: 'Banner',
          exists: { src: true, dst: true },
          fields: [
            { id: 'cta', name: 'CTA', status: VALUE.DIFFERENT, src: { 'es-CO': 'Ver' }, dst: { 'es-CO': 'Comprar' } },
          ],
        },
        { id: 'c', title: 'Otro', exists: { src: true, dst: false }, fields: [] },
      ],
      envs,
      now,
    );
    assert.match(md, /\| CTA \| Ver \| Comprar \| distinto \|/);
    assert.match(md, /No existe en qa\./);
  });

  test('nombre de archivo por defecto', () => {
    assert.equal(
      reportName('modelos', 'develop', 'qa', new Date('2026-10-07T12:00:00Z')),
      'modelos-develop-vs-qa-2026-10-07.md',
    );
  });
});

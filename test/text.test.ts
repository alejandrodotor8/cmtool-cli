import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { compareModels, FIELD } from '../src/core/model.ts';
import { modelChangesFrom } from '../src/core/model-changes.ts';
import { contentTypeStatusParts, EDITOR_DIFF_TEXT, fieldStatusText, modelChangesQuestion } from '../src/ui/text.ts';
import { modelSummary } from '../src/ui/views/summary.ts';
import { contentType, field } from './fixtures.ts';

const nuevo = { diff: { missingCT: true, missing: [1] }, editorFields: [] };
const conCampos = { diff: { missingCT: false, missing: [1] }, editorFields: [] };
const conApariencia = { diff: { missingCT: false, missing: [] }, editorFields: ['title'] };

describe('modelChangesQuestion', () => {
  test('un content type nuevo: no dice "agregar al modelo", porque en destino no existe', () => {
    const { question, note } = modelChangesQuestion([nuevo], 'master');
    assert.equal(question, 'Este content type no existe en master: ¿lo creo?');
    assert.equal(note, 'sin marcar nada, no se crea ninguno');
  });

  test('varios content types nuevos', () => {
    assert.equal(
      modelChangesQuestion([nuevo, nuevo, nuevo], 'qa').question,
      'Estos 3 content types no existen en qa: ¿cuáles creo?',
    );
  });

  test('solo campos que faltan', () => {
    assert.equal(modelChangesQuestion([conCampos], 'qa').question, '¿Qué campos agrego al modelo de qa?');
  });

  test('solo apariencia del editor distinta: avisa que viene marcada', () => {
    const { question, note } = modelChangesQuestion([conApariencia], 'qa');
    assert.equal(question, '¿Qué actualizo en el modelo de qa?');
    assert.equal(note, 'la apariencia viene marcada: espacio para desmarcar');
  });

  test('campos que faltan y apariencia', () => {
    assert.equal(
      modelChangesQuestion([conCampos, conApariencia], 'qa').question,
      '¿Qué agrego o actualizo en el modelo de qa?',
    );
  });

  test('content types nuevos con otras cosas', () => {
    const { question, note } = modelChangesQuestion([nuevo, conCampos], 'qa');
    assert.equal(question, '¿Qué creo o agrego en el modelo de qa?');
    assert.match(note, /1 content type\(s\) nuevo\(s\)/);
  });
});

describe('apariencia del editor en el estado del modelo', () => {
  const [banner] = compareModels(
    new Map([['banner', contentType('banner', [field('title')])]]),
    new Map([['banner', contentType('banner', [field('title')])]]),
  ).diffs;

  test('un content type igual pero con otro help text no queda "al día"', () => {
    assert.deepEqual(contentTypeStatusParts(banner, 'qa'), []);
    assert.deepEqual(contentTypeStatusParts(banner, 'qa', 1), ['1 con otro help text o widget']);
  });

  test('el campo dice que su apariencia es distinta', () => {
    const row = banner.rows[0];
    assert.equal(row.status, FIELD.OK);
    assert.equal(fieldStatusText(row, 'qa', 'es-CO'), 'al día');
    assert.equal(fieldStatusText(row, 'qa', 'es-CO', true), EDITOR_DIFF_TEXT);
  });

  test('copiar solo la apariencia no publica el modelo', () => {
    const changes = modelChangesFrom([{ ctId: 'banner', editor: true }], new Map(), new Map([['banner', ['title']]]));
    assert.match(modelSummary(changes), /help text y widget de 1 campo\(s\)/);
    assert.doesNotMatch(modelSummary(changes), /se publica/);
  });
});

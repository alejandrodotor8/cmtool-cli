import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { modelChangesQuestion } from '../src/ui/text.ts';

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

  test('solo apariencia del editor distinta', () => {
    assert.equal(modelChangesQuestion([conApariencia], 'qa').question, '¿Qué actualizo en el modelo de qa?');
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

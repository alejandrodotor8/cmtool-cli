import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { modelChangesFrom } from 'cmtool-core';
import { modelSummary } from '../src/ui/views/summary.ts';

describe('resumen del modelo', () => {
  test('copiar solo la apariencia no publica el modelo', () => {
    const changes = modelChangesFrom(
      [
        {
          kind: 'editor',
          ctId: 'banner',
          editor: {
            fieldId: 'title',
            parts: ['helpText'],
            helpText: { src: 'Usa una imagen de 1200×600' },
            widget: {},
            settings: [],
          },
        },
      ],
      new Map(),
    );
    assert.match(modelSummary(changes), /apariencia de 1 campo\(s\)/);
    assert.doesNotMatch(modelSummary(changes), /se publica/);
  });
});

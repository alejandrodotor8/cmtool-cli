import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { ModelChanges } from 'cmtool-core';
import { modelSummary } from '../src/ui/views/summary.ts';

describe('resumen del modelo', () => {
  test('copiar solo la apariencia no publica el modelo', () => {
    const changes: ModelChanges = {
      contentTypesToCreate: [],
      infoToUpdate: new Map(),
      fieldsToAdd: new Map(),
      rulesToUpdate: new Map(),
      editorFields: new Map([['banner', new Set(['title'])]]),
    };
    assert.match(modelSummary(changes), /apariencia de 1 campo\(s\)/);
    assert.doesNotMatch(modelSummary(changes), /se publica/);
  });
});

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { EditorControl, EditorInterface } from '../src/contentful/types.ts';
import { editorDifferences, editorDiffsFor, mergeControls, portableControl } from '../src/core/editor.ts';
import { diffContentType } from '../src/core/model.ts';
import { contentType, field } from './fixtures.ts';

const editor = (controls: EditorControl[]) => ({ controls }) as unknown as EditorInterface;
const builtin = (fieldId: string, helpText?: string, widgetId = 'singleLine'): EditorControl => ({
  fieldId,
  widgetId,
  widgetNamespace: 'builtin',
  ...(helpText !== undefined && { settings: { helpText } }),
});

describe('portableControl', () => {
  test('un widget de Contentful se copia con sus ajustes (incluido el help text)', () => {
    assert.deepEqual(portableControl(builtin('alt', 'Texto alternativo')), builtin('alt', 'Texto alternativo'));
  });

  test('de un widget de app o extensión solo se copia el help text', () => {
    const appControl: EditorControl = {
      fieldId: 'color',
      widgetId: 'app-123',
      widgetNamespace: 'app',
      settings: { helpText: 'Color de fondo', paleta: 'marca' },
    };
    assert.deepEqual(portableControl(appControl), { fieldId: 'color', settings: { helpText: 'Color de fondo' } });
    assert.deepEqual(portableControl({ fieldId: 'x', widgetId: 'app-1', widgetNamespace: 'app' }), { fieldId: 'x' });
  });
});

describe('editorDifferences', () => {
  test('detecta help text distinto, widget distinto o control faltante en destino', () => {
    const src = editor([
      builtin('a', 'Ayuda'),
      builtin('b', undefined, 'markdown'),
      builtin('c', 'Igual'),
      builtin('d', 'Nuevo'),
    ]);
    const dst = editor([builtin('a'), builtin('b'), builtin('c', 'Igual')]);
    assert.deepEqual(editorDifferences(src, dst, ['a', 'b', 'c', 'd']), ['a', 'b', 'd']);
  });

  test('solo revisa los campos pedidos', () => {
    const src = editor([builtin('a', 'Ayuda')]);
    assert.deepEqual(editorDifferences(src, editor([]), ['otro']), []);
  });
});

describe('mergeControls', () => {
  test('copia la apariencia de los campos pedidos y deja el resto como está en destino', () => {
    const src = [builtin('alt', 'Texto alternativo'), builtin('title', 'Título de origen')];
    const dst = [builtin('alt'), builtin('title', 'Título de destino'), builtin('soloDestino', 'se queda')];
    assert.deepEqual(mergeControls(dst, src, new Set(['alt'])), [
      builtin('alt', 'Texto alternativo'),
      builtin('title', 'Título de destino'),
      builtin('soloDestino', 'se queda'),
    ]);
  });

  test('agrega el control si destino no lo tiene (campo recién agregado)', () => {
    assert.deepEqual(mergeControls([], [builtin('nuevo', 'Ayuda')], new Set(['nuevo'])), [builtin('nuevo', 'Ayuda')]);
  });
});

describe('editorDiffsFor', () => {
  test('por content type, solo campos que existen en ambos con el mismo tipo', () => {
    const imagen = diffContentType(
      contentType('imagen', [field('alt'), field('archivo', 'Link', { linkType: 'Asset' }), field('soloOrigen')]),
      contentType('imagen', [field('alt'), field('archivo', 'Link', { linkType: 'Asset' })]),
    );
    const nuevo = diffContentType(contentType('nuevo', [field('title')]), undefined);
    const result = editorDiffsFor(
      [imagen, nuevo],
      new Map([
        ['imagen', editor([builtin('alt', 'Describe la imagen'), builtin('archivo'), builtin('soloOrigen', 'x')])],
        ['nuevo', editor([builtin('title', 'y')])],
      ]),
      new Map([['imagen', editor([builtin('alt'), builtin('archivo')])]]),
    );
    assert.deepEqual([...result], [['imagen', ['alt']]]);
  });
});

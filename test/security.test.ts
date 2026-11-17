/**
 * Garantías que se verifican sobre el código fuente: el CLI nunca escribe en Contentful por su
 * cuenta. Todas las escrituras pasan por el writer de cmtool-core, que no puede borrar, archivar
 * ni despublicar (eso lo verifican los tests del núcleo). Si alguien agrega una escritura aquí,
 * este test falla.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src');

const sourceFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const file = path.join(dir, d.name);
    return d.isDirectory() ? sourceFiles(file) : file.endsWith('.ts') ? [file] : [];
  });

/** Llamadas del CMA que escriben. */
const WRITE_CALL = /\.(create|createWithId|update|publish|unpublish|delete|archive|unarchive|processForAllLocales)\(/;

describe('seguridad del código', () => {
  test('el CLI no llama métodos del CMA que escriben: eso solo lo hace el writer de cmtool-core', () => {
    const offenders = sourceFiles(SRC)
      .flatMap((file) =>
        fs
          .readFileSync(file, 'utf8')
          .split('\n')
          .map((line, i) => ({ file, line, n: i + 1 }))
          .filter(({ line }) => WRITE_CALL.test(line) && !line.trim().startsWith('*') && !line.trim().startsWith('//')),
      )
      .map(({ file, n, line }) => `${path.relative(ROOT, file)}:${n}: ${line.trim()}`);
    assert.deepEqual(offenders, []);
  });
});

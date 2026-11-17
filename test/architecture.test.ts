/**
 * La regla del CLI, verificada sobre el código fuente: toda la lógica está en el núcleo
 * (cmtool-core); el CLI solo pregunta, muestra y guarda archivos.
 * - Habla con Contentful solo a través del núcleo: no importa contentful-management.
 * - Usa el núcleo como paquete, por sus entradas públicas ('cmtool-core' y 'cmtool-core/node').
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

/** Un import: `from '…'`, `import('…')` o `import '…'`. */
const IMPORT = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)'([^']+)'/g;

/** Los paquetes de los que importa cada archivo (sin los relativos ni los de Node): `archivo: módulo`. */
const packageImports = sourceFiles(SRC).flatMap((file) =>
  [...fs.readFileSync(file, 'utf8').matchAll(IMPORT)]
    .map((m) => m[1] ?? '')
    .filter((module) => !module.startsWith('.') && !module.startsWith('node:'))
    .map((module) => `${path.relative(ROOT, file)}: ${module}`),
);

describe('arquitectura del CLI', () => {
  test('solo importa el núcleo, la terminal (@clack/prompts) y colores (picocolors)', () => {
    const allowed = /: (cmtool-core|cmtool-core\/node|@clack\/prompts|picocolors)$/;
    assert.deepEqual(
      packageImports.filter((line) => !allowed.test(line)),
      [],
    );
  });

  test('cada paquete que importa está en package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const declared = new Set(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }));
    const missing = packageImports
      .map((line) => line.split(': ')[1] ?? '')
      .map((module) => (module.startsWith('@') ? module.split('/').slice(0, 2).join('/') : module.split('/')[0]))
      .filter((name) => !declared.has(name ?? ''));
    assert.deepEqual([...new Set(missing)], []);
  });
});

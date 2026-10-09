/**
 * Ejecutables de un solo archivo, que no necesitan Node: uno para Mac (Apple Silicon e Intel en el
 * mismo archivo) y uno para Windows, en release/. Usa `bun build --compile`, así que se corre con
 * bun: `bun run build:exe`. La primera vez descarga el runtime de cada sistema (necesita internet).
 *
 * Los de Mac hay que generarlos en un Mac: ahí se juntan los dos procesadores (lipo) y se firman
 * (codesign). Sin firma, macOS no los deja abrir, ni siquiera en la máquina donde se generaron.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

if (!process.versions.bun) {
  console.error('build:exe compila con bun: corre `bun run build:exe` (instalar bun: https://bun.sh).');
  process.exit(1);
}

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = 'release';
const out = (file) => `${OUT}/${file}`;
const sh = (command, args) => execFileSync(command, args, { cwd: root, stdio: 'inherit' });
const compile = (target, file) =>
  sh(process.execPath, ['build', 'src/exe.ts', '--compile', '--minify', '--target', target, '--outfile', out(file)]);

rmSync(`${root}/${OUT}`, { recursive: true, force: true });
mkdirSync(`${root}/${OUT}`);

compile('bun-windows-x64', 'cfm-windows.exe');
compile('bun-darwin-arm64', 'cfm-mac-arm64');
compile('bun-darwin-x64', 'cfm-mac-x64');

const files = ['cfm-windows.exe'];
if (process.platform === 'darwin') {
  sh('lipo', ['-create', out('cfm-mac-arm64'), out('cfm-mac-x64'), '-output', out('cfm-mac')]);
  rmSync(`${root}/${out('cfm-mac-arm64')}`);
  rmSync(`${root}/${out('cfm-mac-x64')}`);
  sh('codesign', ['--sign', '-', '--force', out('cfm-mac')]);
  files.unshift('cfm-mac');
} else {
  files.unshift('cfm-mac-arm64', 'cfm-mac-x64');
  console.warn('\n⚠ Los de Mac quedaron sin firmar: genéralos en un Mac, o macOS no los deja abrir.');
}

console.log(`\nListo, en ${OUT}/:`);
for (const file of files) {
  console.log(`  ${file.padEnd(16)} ${Math.round(statSync(`${root}/${out(file)}`).size / 1e6)} MB`);
}

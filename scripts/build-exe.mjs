/**
 * Ejecutables de un solo archivo, que no necesitan Node, en release/. Usa `bun build --compile`,
 * así que se corre con bun: `bun run build:exe`. La primera vez descarga el runtime de cada
 * sistema (necesita internet).
 *
 * - Windows: cfm-windows.exe.
 * - Mac: cfm.app (Apple Silicon e Intel en el mismo ejecutable, con ícono) y cfm-mac.zip para
 *   repartirla. Solo se arma en un Mac: usa lipo, sips, iconutil y codesign, que vienen con macOS.
 *
 * Firma de la app: con un certificado "Developer ID Application" en el llavero (o el que diga
 * CFM_SIGN_IDENTITY) se firma para repartir, y si además está CFM_NOTARY_PROFILE (un perfil
 * guardado con `xcrun notarytool store-credentials`) se notariza con Apple. Sin certificado se
 * firma solo para este Mac: en otros, macOS pide "Abrir igualmente".
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

if (!process.versions.bun) {
  console.error('build:exe compila con bun: corre `bun run build:exe` (instalar bun: https://bun.sh).');
  process.exit(1);
}

const root = fileURLToPath(new URL('..', import.meta.url));
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const OUT = fileURLToPath(new URL('../release', import.meta.url));
/** Identificador de la app en macOS (cámbialo si la organización usa otro). */
const BUNDLE_ID = 'com.dislicores.cfm';

const sh = (command, args, { quiet = false } = {}) =>
  execFileSync(command, args, { cwd: root, stdio: quiet ? 'ignore' : 'inherit' });
const read = (command, args) => execFileSync(command, args, { cwd: root, encoding: 'utf8' });
const compile = (target, outfile) =>
  sh(process.execPath, ['build', 'src/exe.ts', '--compile', '--minify', '--target', target, '--outfile', outfile]);
const size = (file) => `${Math.round(statSync(file).size / 1e6)} MB`;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);

compile('bun-windows-x64', `${OUT}/cfm-windows.exe`);
const summary = [`cfm-windows.exe  ${size(`${OUT}/cfm-windows.exe`)}`];

if (process.platform === 'darwin') {
  summary.unshift(...buildMacApp());
} else {
  console.warn('\n⚠ La app de Mac solo se arma en un Mac (lipo, iconutil y codesign son de macOS).');
}

console.log(`\nListo, en release/:\n${summary.map((line) => `  ${line}`).join('\n')}`);

/** Arma, firma y empaqueta cfm.app. Devuelve las líneas del resumen. */
function buildMacApp() {
  const app = `${OUT}/cfm.app`;
  const work = `${OUT}/.mac`;
  mkdirSync(`${app}/Contents/MacOS`, { recursive: true });
  mkdirSync(`${app}/Contents/Resources`);
  mkdirSync(`${work}/cfm.iconset`, { recursive: true });

  // Un solo ejecutable con los dos procesadores.
  compile('bun-darwin-arm64', `${work}/cfm-arm64`);
  compile('bun-darwin-x64', `${work}/cfm-x64`);
  sh('lipo', ['-create', `${work}/cfm-arm64`, `${work}/cfm-x64`, '-output', `${app}/Contents/MacOS/cfm`]);

  // Ícono: todos los tamaños de macOS a partir de assets/icon.png (1024×1024).
  for (const px of [16, 32, 128, 256, 512]) {
    for (const [scale, suffix] of [
      [1, ''],
      [2, '@2x'],
    ]) {
      const side = String(px * scale);
      const out = `${work}/cfm.iconset/icon_${px}x${px}${suffix}.png`;
      sh('sips', ['-z', side, side, 'assets/icon.png', '--out', out], { quiet: true });
    }
  }
  sh('iconutil', ['-c', 'icns', `${work}/cfm.iconset`, '-o', `${app}/Contents/Resources/cfm.icns`]);

  writeFileSync(`${app}/Contents/Info.plist`, infoPlist(minimumMacOS(`${work}/cfm-arm64`)));
  rmSync(work, { recursive: true, force: true });

  const signed = sign(app);
  const zip = `${OUT}/cfm-mac.zip`;
  const pack = () => sh('ditto', ['-c', '-k', '--keepParent', app, zip]);
  pack();

  const profile = process.env.CFM_NOTARY_PROFILE;
  let notarized = false;
  if (signed && profile) {
    sh('xcrun', ['notarytool', 'submit', zip, '--keychain-profile', profile, '--wait']);
    sh('xcrun', ['stapler', 'staple', app]); // falla si Apple no la aprobó (detalle: xcrun notarytool log <id>)
    rmSync(zip);
    pack();
    notarized = true;
  }

  const status = notarized
    ? 'firmada con Developer ID y notarizada: abre en cualquier Mac sin avisos'
    : signed
      ? 'firmada con Developer ID, sin notarizar (falta CFM_NOTARY_PROFILE): otros Mac la frenan'
      : 'firma local (no hay certificado Developer ID Application): en otros Mac pide "Abrir igualmente"';
  return [
    `cfm.app          ${size(`${app}/Contents/MacOS/cfm`)} · ${status}`,
    `cfm-mac.zip      ${size(zip)} · para repartir`,
  ];
}

/** Firma la app. Devuelve si quedó firmada con Developer ID (para repartir) o solo para este Mac. */
function sign(app) {
  const identity =
    process.env.CFM_SIGN_IDENTITY ??
    read('security', ['find-identity', '-v', '-p', 'codesigning']).match(/"(Developer ID Application: [^"]+)"/)?.[1];
  if (identity) {
    // Hardened runtime, sello de tiempo y los permisos que necesita bun: lo que pide la notarización.
    const flags = ['--options', 'runtime', '--timestamp', '--entitlements', 'scripts/entitlements.plist'];
    sh('codesign', ['--force', ...flags, '--sign', identity, app]);
  } else {
    sh('codesign', ['--force', '--sign', '-', app]);
  }
  sh('codesign', ['--verify', '--strict', app]);
  return Boolean(identity);
}

/** La versión mínima de macOS que pide el ejecutable de bun (en un Mac más viejo, macOS lo dice al abrirla). */
function minimumMacOS(binary) {
  return read('vtool', ['-show-build', binary]).match(/minos (\d+(?:\.\d+)*)/)?.[1] ?? '13.0';
}

function infoPlist(minimum) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>cfm</string>
  <key>CFBundleDisplayName</key>
  <string>cfm</string>
  <key>CFBundleIdentifier</key>
  <string>${BUNDLE_ID}</string>
  <key>CFBundleExecutable</key>
  <string>cfm</string>
  <key>CFBundleIconFile</key>
  <string>cfm</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleShortVersionString</key>
  <string>${version}</string>
  <key>CFBundleVersion</key>
  <string>${version}</string>
  <key>LSMinimumSystemVersion</key>
  <string>${minimum}</string>
  <key>LSApplicationCategoryType</key>
  <string>public.app-category.developer-tools</string>
  <!-- Se abre en Terminal y termina: sin ícono propio en el Dock. -->
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
`;
}

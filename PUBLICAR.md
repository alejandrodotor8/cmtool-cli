# Publicar cmtool-cli en npm

`cmtool-cli` usa el núcleo, `cmtool-core`, y lo lleva dentro de su build. Por eso **primero se publica el núcleo** (con el `PUBLICAR.md` de su repo) y después el CLI. Esta guía no se incluye en el paquete: npm solo sube lo que dice `files` en `package.json`.

## Antes de la primera vez

Se hace una sola vez.

1. **Pide el núcleo desde npm, no enlazado.** Mientras el núcleo no esté en npm, `package.json` lo pide así: `"cmtool-core": "link:cmtool-core"`. Eso apunta a la carpeta del núcleo en tu equipo. Cuando ya esté publicado, cámbialo por su versión exacta:

   ```bash
   bun add -d -E cmtool-core@0.17.0
   bun run check && bun run build
   ```

   Desde ahí el repo ya no necesita la carpeta del núcleo, y se instala con cualquier gestor (npm, pnpm, yarn o bun). Para seguir probando cambios del núcleo sin publicarlo, usa `bun link cmtool-core` (README, sección *Desarrollo*).
2. **Comprueba que el nombre siga libre**: `npm view cmtool-cli` debe responder `404`; así estaba el 17 de noviembre de 2026.
3. **Sube el repositorio** y agrega `repository`, `homepage` y `bugs` en `package.json`, con la dirección del repo. Así los enlaces del README funcionan en la página de npm.
4. **Inicia sesión**: `npm login`, y comprueba la cuenta con `npm whoami`.

**Ya está decidido y hecho** (17 de noviembre de 2026): el paquete es **público y sin scope**, con licencia **MIT** a nombre de Alejandro Dotor ([LICENSE](LICENSE)), y ya no tiene `"private": true`. Así que `npm publish` desde esta carpeta **publica de verdad**. En lugar de ese seguro, [test/app.test.ts](test/app.test.ts) falla si cambia lo que se sube o si falta la licencia, y `prepublishOnly` no deja publicar si un test falla.

## Qué lleva el paquete

| Archivo | Para qué |
| --- | --- |
| `bin/cfm.mjs`, `bin/stale-build.mjs` | el comando `cfm` |
| `bin/cfm-dev.mjs` | se instala, pero solo funciona desde el repositorio, y lo dice |
| `dist/cli.js` | el build: el CLI, el núcleo y sus dependencias en un solo archivo. Se genera solo al empaquetar (`prepack`) |
| `README.md`, `CHANGELOG.md`, `LICENSE`, `package.json` | lo que se ve en la página de npm |

Solo instala `picocolors`. No lleva `src/`, los tests ni el grafo. **La app de Mac y el `.exe` no van en npm**: se reparten como archivo (README, sección *Ejecutables para Mac y Windows*).

## Cada versión

1. **Si cambió el núcleo**, publícalo primero y actualízalo aquí: `bun add -d -E cmtool-core@<versión>`.
2. **CHANGELOG y versión.** Agrega una entrada en [CHANGELOG.md](CHANGELOG.md) y sube la versión: menor si es una funcionalidad, de parche si es una corrección.

   ```bash
   bun pm version 0.18.0 --no-git-tag-version   # o: npm version 0.18.0 --no-git-tag-version
   ```

3. **Revisa que todo pase**: `bun run check`.
4. **Mira qué se va a publicar**: `npm pack --dry-run`. Deben salir 8 archivos, unos 191 kB: los tres de `bin/`, `dist/cli.js`, `README.md`, `CHANGELOG.md`, `LICENSE` y `package.json`.
5. **Pruébalo instalado como lo recibe otra persona**, sin tocar tu `cfm`:

   ```bash
   npm pack --pack-destination /tmp
   npm install -g --prefix /tmp/prueba-cfm /tmp/cmtool-cli-0.18.0.tgz
   /tmp/prueba-cfm/bin/cfm --version
   ```

   `--prefix` lo instala en esa carpeta y no en tu sistema, así que tu `cfm` (el de `bun link`) no cambia. En Windows (PowerShell), usa `$env:TEMP` en lugar de `/tmp`, y el comando queda en `$env:TEMP\prueba-cfm\cfm.cmd`.
6. **Publica**:

   ```bash
   npm publish
   ```

   `prepublishOnly` corre el `check`, así que si un test falla no se publica. `prepack` corre el `build`, así que `dist/cli.js` siempre sale del código actual. `bun publish` también sirve.
7. **Verifica** (`npm view cmtool-cli version`) y **guarda la versión en git**:

   ```bash
   git commit -am "Versión 0.18.0: …"
   git tag v0.18.0
   git push && git push --tags
   ```

## Cómo lo instala el equipo

Con Node 22.18 o superior, en macOS o Windows:

| | npm | pnpm | bun |
| --- | --- | --- | --- |
| Instalar | `npm install -g cmtool-cli` | `pnpm add -g cmtool-cli` | `bun add -g cmtool-cli` |
| Actualizar | `npm install -g cmtool-cli@latest` | `pnpm add -g cmtool-cli@latest` | `bun add -g cmtool-cli@latest` |

- **Si `cfm` no aparece** después de instalar, la carpeta global de ese gestor no está en el PATH. Con pnpm, corre `pnpm setup` y abre otra terminal. Con bun, revisa que `~/.bun/bin` esté en el PATH.
- **Tú, que lo tienes con `bun link`**: no lo instales además desde npm, porque tendrías dos `cfm` en el PATH. Para pasarte a la versión de npm, corre `bun unlink` en el repo y después `bun add -g cmtool-cli`.

## Si algo sale mal

Los errores de `npm publish` son los mismos que en el núcleo: nombre ajeno (`403`), versión repetida, código de verificación (`EOTP`) y sesión (`ENEEDAUTH`). La tabla con qué hacer en cada caso está en el `PUBLICAR.md` de `cmtool-core`.

Uno es propio del CLI: **`npm install` falla con `EUNSUPPORTEDPROTOCOL` / `Unsupported URL Type "link:"`**. El repo todavía pide el núcleo enlazado. Ese formato solo lo entiende bun: haz el paso 1 de *Antes de la primera vez*.

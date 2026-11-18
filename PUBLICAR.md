# Publicar cmtool-cli en npm

Se publica **solo, con GitHub Actions, al subir una etiqueta de versión** (`v0.18.0`), igual que el núcleo. `cmtool-cli` lleva el núcleo (`cmtool-core`) dentro de su build, así que **primero se publica el núcleo** y después el CLI.

**El núcleo y el CLI llevan siempre la misma versión:** `cfm` 0.18.0 lleva el núcleo 0.18.0. Cada versión se publica en los dos, aunque uno no haya cambiado, y [test/app.test.ts](test/app.test.ts) falla si `package.json` pide otra versión del núcleo. Esta guía no se incluye en el paquete: npm solo sube lo que dice `files` en `package.json`.

## Cómo funciona

| Workflow | Cuándo corre | Qué hace |
| --- | --- | --- |
| [ci.yml](.github/workflows/ci.yml) | cada push a `main` y cada pull request | `check` (tipos, lint y tests), `build` y `npm pack --dry-run` |
| [release.yml](.github/workflows/release.yml) | al subir una etiqueta `vX.Y.Z`, o al crear un Release en GitHub con una etiqueta nueva | revisa que la etiqueta sea la versión de `package.json` y, si esa versión no está ya en npm, `npm publish` con trusted publishing |

`npm publish` corre antes `prepublishOnly` (el `check`) y `prepack` (el `build`, así que `dist/cli.js` siempre sale del código actual). El paquete es **público y sin scope**, con licencia **MIT** a nombre de Alejandro Dotor ([LICENSE](LICENSE)). [test/app.test.ts](test/app.test.ts) falla si cambia lo que se sube o si falta la licencia.

## Configuración (una sola vez)

**El núcleo, desde npm.** La Action instala las dependencias desde npm, así que `package.json` pide el núcleo con su versión exacta (`"cmtool-core": "0.17.0"`), nunca `link:cmtool-core`: npm no lo entiende y la Action fallaría. [test/app.test.ts](test/app.test.ts) lo revisa. Para probar cambios del núcleo sin publicarlo, `bun link cmtool-core` enlaza la carpeta local sin tocar `package.json` (README, sección *Build y desarrollo*).

La Action publica con **trusted publishing**: npm confía en este workflow (`release.yml`, environment `prod`, repo `alejandrodotor8/cmtool-cli`) y no hace falta ningún token. Pero npm solo deja configurarlo **para un paquete que ya existe**, así que la primera versión se publica a mano:

1. **La primera versión, desde tu terminal**, en la carpeta de este repo y con la versión de la etiqueta (`v0.17.0`):

   ```bash
   npm login          # y comprueba con npm whoami
   npm publish        # corre check y build antes de subir; npm te pide tu verificación en dos pasos
   ```

   Mientras confirmas la verificación, npm puede mostrar una versión `0.0.0-stage` ("Temporary Holding Version"). Es un aviso de npm, no tu paquete: al aprobar, la versión real queda como `latest`. Con el núcleo pasó así y tardó un par de minutos. Compruébalo con `npm view cmtool-cli version`.

2. **Sube la etiqueta de esa versión** (`git push origin v0.17.0`). La Action ve que ya está en npm y no hace nada.
3. **Justo antes de publicar la segunda versión, registra la Action como trusted publisher** (pide tu verificación en dos pasos):

   ```bash
   npm trust github cmtool-cli --file release.yml --repo alejandrodotor8/cmtool-cli --env prod --allow-publish
   npm trust list cmtool-cli   # para revisarlo
   ```

   **No lo hagas antes:** npm borra un trusted publisher nuevo si no publica nada en los 2 días siguientes. Regístralo y, ese mismo día, sube la etiqueta de la versión nueva. Desde ahí la Action publica sola, siempre.

   Para `cmtool-cli` ya está hecho: se registró el 17 de noviembre de 2026, y la 0.17.1 la publicó la Action.

   Es lo mismo que en npmjs.com → `cmtool-cli` → *Settings* → *Trusted Publisher* → *GitHub Actions*, con *Allowed actions*: `npm publish`. **`--allow-publish` es necesario**: sin él, npm solo deja que el workflow prepare la publicación (`npm stage publish`) y que tú la apruebes.

No uses un token con *bypass 2FA*: npm ya no deja que esos tokens publiquen directo (responde `EOTP`), y van a perder ese permiso del todo. Si ya creaste uno para esto, bórralo en npmjs.com (*Access Tokens*) y el secreto `NPM_TOKEN` del environment `prod` en GitHub: el workflow ya no lo usa.

**El push, desde este equipo**, entra con la llave SSH de `alejandrodotor8`: el remoto es `git@github-alejandrodotor8:alejandrodotor8/cmtool-cli.git`, con el alias de `~/.ssh/config` (que no usa el agente, para no entrar con la llave de Pragma). En otro equipo basta `git@github.com:alejandrodotor8/cmtool-cli.git` con tu llave.

## Qué lleva el paquete

| Archivo | Para qué |
| --- | --- |
| `bin/cfm.mjs`, `bin/stale-build.mjs` | el comando `cfm`, el único que instala |
| `dist/cli.js` | el build: el CLI, el núcleo y sus dependencias en un solo archivo |
| `README.md`, `CHANGELOG.md`, `LICENSE`, `package.json` | lo que se ve en la página de npm |

Son 7 archivos, unos 183 kB, y solo instala `picocolors`. No lleva `src/`, `scripts/` (ahí está el script `dev`, que corre el código fuente), los tests ni el grafo. `bin/` se publica entero, así que ahí solo va lo que usa `cfm`; [test/app.test.ts](test/app.test.ts) lo revisa. **La app de Mac y el `.exe` no van en npm**: se reparten como archivo (README, sección *Ejecutables para Mac y Windows*).

## Cada versión

1. **Publica primero el núcleo con la misma versión** (aunque no haya cambiado) y actualízalo aquí: `bun add -d -E cmtool-core@<versión>`.
2. **CHANGELOG y versión.** Agrega una entrada en [CHANGELOG.md](CHANGELOG.md) y sube la versión: menor si es una funcionalidad, de parche si es una corrección.

   ```bash
   bun pm version 0.18.0 --no-git-tag-version   # o: npm version 0.18.0 --no-git-tag-version
   ```

3. **Revisa que todo pase**: `bun run check`.
4. **Commit y push a `main`** (corre el CI): `git commit -am "Versión 0.18.0: …" && git push`.
5. **Publica subiendo la etiqueta**: `git tag v0.18.0 && git push origin v0.18.0`. La Action *Publicar en npm* aparece en la pestaña *Actions*.
6. **Verifica**: `npm view cmtool-cli version`.

Para probar el paquete instalado como lo recibe otra persona, sin tocar tu `cfm`:

```bash
npm pack --pack-destination /tmp
npm install -g --prefix /tmp/prueba-cfm /tmp/cmtool-cli-0.18.0.tgz
/tmp/prueba-cfm/bin/cfm --version
```

`--prefix` lo instala en esa carpeta y no en tu sistema. En Windows (PowerShell), usa `$env:TEMP` en lugar de `/tmp`; el comando queda en `$env:TEMP\prueba-cfm\cfm.cmd`.

Si la Action no está disponible, puedes publicar desde tu terminal: `npm login` y `npm publish`. Después sube la etiqueta igual: la Action verá que ya está publicada.

## Cómo lo instala el equipo

Con Node 22.18 o superior, en macOS o Windows:

| | npm | pnpm | bun |
| --- | --- | --- | --- |
| Instalar | `npm install -g cmtool-cli` | `pnpm add -g cmtool-cli` | `bun add -g cmtool-cli` |
| Actualizar | `npm install -g cmtool-cli@latest` | `pnpm add -g cmtool-cli@latest` | `bun add -g cmtool-cli@latest` |

- **Si `cfm` no aparece** después de instalar, la carpeta global de ese gestor no está en el PATH. Con pnpm, corre `pnpm setup` y abre otra terminal. Con bun, revisa que `~/.bun/bin` esté en el PATH.
- **Tú, que lo tienes con `bun link`**: no lo instales además desde npm, porque tendrías dos `cfm` en el PATH. Para pasarte a la versión de npm, corre `bun unlink` en el repo y después `bun add -g cmtool-cli`.

## Si algo sale mal

Los errores de la Action son los mismos que en el núcleo: etiqueta que no coincide con la versión, trusted publisher que falta o no coincide (`ENEEDAUTH`, `E401`, `E404`), que solo permite `stage` (`E403`), o un token en vez de trusted publishing (`EOTP`). La tabla con qué hacer en cada caso está en el `PUBLICAR.md` de `cmtool-core`. Después de corregir, *Re-run jobs* vuelve a correr la publicación; si la versión ya está en npm, no hace nada.

Uno es propio del CLI: **la instalación falla con `link:cmtool-core`** (en la Action o con npm, `EUNSUPPORTEDPROTOCOL`). `package.json` pide el núcleo enlazado, por ejemplo después de `bun link --save`. Vuelve a la versión exacta: `bun add -d -E cmtool-core@<versión>`. `bun run check` lo detecta antes del commit.

# Publicar cmtool-cli en npm

Se publica **solo, con GitHub Actions, al subir una etiqueta de versión** (`v0.18.0`), igual que el núcleo. `cmtool-cli` lleva el núcleo (`cmtool-core`) dentro de su build, así que **primero se publica el núcleo** y después el CLI. Esta guía no se incluye en el paquete: npm solo sube lo que dice `files` en `package.json`.

## Cómo funciona

| Workflow | Cuándo corre | Qué hace |
| --- | --- | --- |
| [ci.yml](.github/workflows/ci.yml) | cada push a `main` y cada pull request | `check` (tipos, lint y tests), `build` y `npm pack --dry-run` |
| [release.yml](.github/workflows/release.yml) | al subir una etiqueta `vX.Y.Z`, o al crear un Release en GitHub con una etiqueta nueva | revisa que la etiqueta sea la versión de `package.json`, y `npm publish --provenance --access public` |

`npm publish` corre antes `prepublishOnly` (el `check`) y `prepack` (el `build`, así que `dist/cli.js` siempre sale del código actual). El paquete es **público y sin scope**, con licencia **MIT** a nombre de Alejandro Dotor ([LICENSE](LICENSE)). [test/app.test.ts](test/app.test.ts) falla si cambia lo que se sube o si falta la licencia.

## Configuración (una sola vez)

1. **El núcleo, desde npm.** La Action instala las dependencias desde npm, así que `package.json` tiene que pedir el núcleo con su versión exacta (`"cmtool-core": "0.17.0"`), no `link:cmtool-core`. Si todavía dice `link:`, cámbialo cuando el núcleo esté publicado:

   ```bash
   bun add -d -E cmtool-core@0.17.0
   bun run check && bun run build
   ```

   Para probar cambios del núcleo sin publicarlo, `bun link cmtool-core` enlaza la carpeta local (README, sección *Desarrollo*). No hagas commit con `link:`: la Action fallaría.
2. **El token de npm** como secreto `NPM_TOKEN` del environment `prod` de este repo, igual que en el núcleo: *Settings* → *Environments* → `prod` → *Add environment secret*. Puede ser el mismo token, si su permiso cubre `cmtool-cli`.
3. **Mejor, sin token: *trusted publishing*.** Después de la primera publicación, en npmjs.com → `cmtool-cli` → *Settings* → *Trusted Publisher* → *GitHub Actions*: usuario `alejandrodotor8`, repositorio `cmtool-cli`, workflow `release.yml`, environment `prod`. Después puedes borrar el secreto.
4. **El push, desde este equipo**, entra con la llave SSH de `alejandrodotor8`: el remoto es `git@github-alejandrodotor8:alejandrodotor8/cmtool-cli.git`, con el alias de `~/.ssh/config`.

## Qué lleva el paquete

| Archivo | Para qué |
| --- | --- |
| `bin/cfm.mjs`, `bin/stale-build.mjs` | el comando `cfm` |
| `bin/cfm-dev.mjs` | se instala, pero solo funciona desde el repositorio, y lo dice |
| `dist/cli.js` | el build: el CLI, el núcleo y sus dependencias en un solo archivo |
| `README.md`, `CHANGELOG.md`, `LICENSE`, `package.json` | lo que se ve en la página de npm |

Son 8 archivos, unos 191 kB, y solo instala `picocolors`. No lleva `src/`, los tests ni el grafo. **La app de Mac y el `.exe` no van en npm**: se reparten como archivo (README, sección *Ejecutables para Mac y Windows*).

## Cada versión

1. **Si cambió el núcleo**, publícalo primero y actualízalo aquí: `bun add -d -E cmtool-core@<versión>`.
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

Si la Action no está disponible, puedes publicar desde tu terminal: `npm login` y `npm publish`.

## Cómo lo instala el equipo

Con Node 22.18 o superior, en macOS o Windows:

| | npm | pnpm | bun |
| --- | --- | --- | --- |
| Instalar | `npm install -g cmtool-cli` | `pnpm add -g cmtool-cli` | `bun add -g cmtool-cli` |
| Actualizar | `npm install -g cmtool-cli@latest` | `pnpm add -g cmtool-cli@latest` | `bun add -g cmtool-cli@latest` |

- **Si `cfm` no aparece** después de instalar, la carpeta global de ese gestor no está en el PATH. Con pnpm, corre `pnpm setup` y abre otra terminal. Con bun, revisa que `~/.bun/bin` esté en el PATH.
- **Tú, que lo tienes con `bun link`**: no lo instales además desde npm, porque tendrías dos `cfm` en el PATH. Para pasarte a la versión de npm, corre `bun unlink` en el repo y después `bun add -g cmtool-cli`.

## Si algo sale mal

Los errores de la Action son los mismos que en el núcleo: etiqueta que no coincide con la versión, token que falta o venció (`ENEEDAUTH`, `E401`), permiso del token o trusted publisher (`E404`), nombre ajeno o versión repetida (`403`). La tabla con qué hacer en cada caso está en el `PUBLICAR.md` de `cmtool-core`. Después de corregir, *Re-run jobs* vuelve a correr la publicación.

Uno es propio del CLI: **la instalación falla con `link:cmtool-core`** (en la Action o con npm, `EUNSUPPORTEDPROTOCOL`). `package.json` todavía pide el núcleo enlazado: haz el paso 1 de la configuración.

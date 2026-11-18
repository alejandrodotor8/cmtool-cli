# Desarrollar cfm

Guía para programar `cmtool-cli`. Para usar `cfm`, mira el [README](README.md); para publicar una versión, [PUBLICAR.md](PUBLICAR.md). Este archivo no va en el paquete de npm.

## Los tres repositorios

| Repositorio | Paquete de npm | Qué es |
| --- | --- | --- |
| `cmtool-core` | `cmtool-core` | El núcleo: toda la lógica, sin pantalla ni terminal. Lo usan el CLI y la web. |
| **`cmtool-cli`** (este) | `cmtool-cli` | La terminal: el comando `cfm`, la app de Mac y el ejecutable de Windows. |
| `backoffice-b2c` | — | El back office web (Next.js), en construcción. |

Son independientes: el CLI usa el núcleo como cualquier dependencia de npm, y ninguno necesita la carpeta de otro para instalar, compilar ni correr sus tests.

**Una regla:** toda la lógica está en el núcleo. Si algo decide qué se migra o habla con Contentful, va en `cmtool-core` (así también lo tiene la web). Si pregunta, muestra o guarda archivos, va aquí.

**El núcleo y el CLI llevan siempre la misma versión** (los dos en 0.18.0, por ejemplo). El CLI pide el núcleo con su misma versión, y [test/app.test.ts](test/app.test.ts) falla si no coinciden. Por eso cada versión publica los dos, aunque uno no haya cambiado (ver [PUBLICAR.md](PUBLICAR.md)).

## Preparar el equipo

Hace falta **Node 22.18 o superior** (el repo trae `.node-version` con la 24) y un gestor de paquetes: npm (viene con Node), pnpm, yarn 1 o bun. El proyecto no obliga a ninguno y no sube lockfiles.

**macOS:**

```bash
fnm install 24                                   # Node con fnm
corepack enable pnpm                             # solo si usas pnpm (o: brew install pnpm)
curl -fsSL https://bun.sh/install | bash         # solo si usas bun (o: brew install oven-sh/bun/bun)
```

**Windows**, en Windows Terminal con PowerShell:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned   # una vez: sin esto, PowerShell bloquea npm y pnpm
winget install OpenJS.NodeJS.LTS                       # Node (trae npm)
winget install pnpm.pnpm                               # solo si usas pnpm
winget install Oven-sh.Bun                             # solo si usas bun
```

Cierra y abre la terminal después de instalar. Con pnpm, la primera vez corre `pnpm setup` y abre otra terminal, para que sus comandos globales queden en el PATH.

El Contentful CLI (`npm install -g contentful-cli`, y `contentful login`) es opcional: sin él, `cfm` pide pegar un token la primera vez.

## Instalar desde el código

Desde la carpeta del repositorio, con tu gestor:

| | npm | pnpm | bun |
| --- | --- | --- | --- |
| **Instalar dependencias** | `npm install` | `pnpm install` | `bun install` |
| **Compilar (build)** | `npm run build` | `pnpm build` | `bun run build` |
| **Instalar el comando** | `npm link` | `pnpm add -g "link:$PWD"` | `bun link` |
| **Quitar el comando** | `npm rm -g cmtool-cli` | `pnpm rm -g cmtool-cli` | `bun unlink` |
| **Correr el build sin instalar** | `npm start -- --dry-run` | `pnpm start --dry-run` | `bun run start --dry-run` |
| **Correr el código fuente** | `npm run dev -- --dry-run` | `pnpm dev --dry-run` | `bun run dev --dry-run` |

- `npm install` (o el de tu gestor) descarga el núcleo desde npm: no hace falta tener su repositorio.
- El comando instalado es un **enlace a esta carpeta**, no una copia: después de cada `build`, `cfm` ya corre lo nuevo. Con pnpm se usa `link:` porque en pnpm 10+ ya no existe `pnpm link --global`.
- **yarn 1** sirve para instalar dependencias y correr los scripts (`yarn install`, `yarn build`, `yarn run check`; ojo: `yarn check` a secas es un comando de yarn). Para instalar el comando, usa `npm link`.
- **Con npm y fnm/nvm**, `npm link` instala el comando en la versión de Node activa: si cambias de versión, repítelo.
- Instala `cfm` de **una sola forma** (enlazado o desde npm): si tienes las dos, gana la primera del PATH.

## Build y el script `dev`

| Cómo | Qué corre | Cuándo cambia |
| --- | --- | --- |
| `cfm` (o `bun run start`) | el **build**: el CLI y el núcleo empaquetados en un solo archivo, `dist/cli.js` | solo cuando vuelves a correr `build` |
| `bun run dev` (el script `dev`) | el **código fuente** de `src/`, sin compilar; el núcleo, ya compilado, desde `node_modules` | con cada cambio que guardes |

- **El script `dev`** recibe las mismas opciones que `cfm` (`bun run dev migrate --dry-run`; con npm, `npm run dev -- migrate --dry-run`) y lo dice en la cabecera: *[desarrollo: código fuente]*. Solo funciona desde esta carpeta: es [scripts/dev.mjs](scripts/dev.mjs), que no se publica. Nada de lo que es solo para desarrollar va en el paquete.
- **`cfm` avisa si el build quedó viejo**: si `src/` o el núcleo instalado son más nuevos que `dist/cli.js` (por ejemplo, después de cambiar de rama). Sigue corriendo el build anterior. Si no hay build, te dice que corras `build`.
- **Por qué un solo archivo:** esbuild junta el código, el núcleo y sus dependencias. Así `cfm` abre unos 20 archivos al arrancar en vez de unos 440, y la primera ejecución no se siente lenta. El script `dev` lee los archivos sueltos y arranca más lento.
- **Mientras ves el menú**, la herramienta ya se conecta con Contentful y trae tus spaces y ambientes. Con `--verbose` no lo hace, para no mezclar líneas con el menú.
- `dist/` no se sube al repo; al publicar en npm se genera solo. `pnpm-workspace.yaml` solo sirve a pnpm, para que esbuild pueda correr su instalación.

## Scripts

Con tu gestor (`npm run …`, `pnpm …`, `yarn run …` o `bun run …`):

| Script | Qué hace |
| --- | --- |
| `check` | `typecheck` + `lint` + `test`: córrelo antes de cada commit |
| `typecheck` | revisa tipos con tsc (no genera archivos) |
| `lint` / `format` | lint y formato con Biome / aplica el formato y sus arreglos |
| `test` | tests con `node:test` (siempre con Node, también desde bun) |
| `build` | empaqueta el CLI y el núcleo en `dist/cli.js` |
| `build:release` | la app de Mac y el ejecutable de Windows, en `release/` |
| `start` / `dev` | corre el build / el código fuente, sin el comando global |

## Cómo usa el CLI al núcleo

El CLI importa `cmtool-core` como cualquier paquete, con versión exacta y como dependencia de desarrollo: el build lo mete dentro de `dist/cli.js`, así que quien instala `cfm` no lo descarga.

Cada comando que escribe sigue las etapas de una migración del núcleo. Cada etapa devuelve la siguiente, y el comando solo pone las preguntas y las tablas entre una y otra. Así se ve [commands/migrate.ts](src/commands/migrate.ts), resumido:

```ts
const migration = entryMigration(ctx.space, ctx);      // ctx: el space y los ambientes elegidos
const tree = await migration.analyze(rootIds);         // 1. el árbol (solo lee)
renderEntryTree(tree.preview(toUpdate));               //    …y se pregunta qué actualizar
const review = await tree.review(toUpdate);            // 2. modelo, imágenes y tags (solo lee)
const choices = await review.modelChoices();           //    …y se pregunta qué cambios de modelo aplicar
const plan = review.plan({ withAssets, picked });      // 3. qué se escribe (puro)
renderSummary(review.analysis, plan.plan, …);          //    …y se confirma
await plan.execute(await startWriting(ctx, 'migrate')); // 4. escribir, con respaldo y barra de progreso
```

Volver a una pregunta anterior no repite lecturas: las etapas guardan su resultado, y la conexión (`connect`, en [commands/context.ts](src/commands/context.ts)) lee una sola vez los spaces, ambientes, modelos e idiomas.

**Para probar cambios del núcleo sin publicarlo**, enlázalo con bun:

```bash
cd ../cmtool-core && bun run build && bun link   # una vez: registra el núcleo en este equipo
cd ../cmtool-cli && bun link cmtool-core         # node_modules/cmtool-core apunta al repo del núcleo
```

`bun link cmtool-core` no cambia `package.json`. Después de cada cambio en el núcleo, corre `bun run build` en su repo: el script `dev` ya lo ve, y `cfm` después de `bun run build` aquí. Para volver a la versión de npm, `bun install --force` (con `bun install` a secas, el enlace se queda). No uses `bun link --save`: escribe `link:cmtool-core` en `package.json`, que npm no entiende, y el test lo rechaza.

## Tests

Son **unitarios**: prueban la terminal y las utilidades del CLI, no hacen migraciones reales. Las reglas de la migración (qué se crea, qué se actualiza, el modelo, la escritura, el respaldo) se prueban en el núcleo.

[test/setup.ts](test/setup.ts) se carga antes de cada archivo de test y garantiza que **no hay red** (cualquier conexión falla, así que ningún test llega a Contentful) y que **no se toca tu carpeta personal** (los tests ven una carpeta temporal como HOME, sin tu sesión ni tus respaldos). `isolation.test.ts` revisa que esa protección esté activa.

| Archivo | Qué prueba |
| --- | --- |
| `cli-args.test.ts` | comandos y flags, la ayuda generada, y que "Repetir" se vuelve a leer igual |
| `app.test.ts` | nombre y versión, el núcleo con la misma versión, y qué se publica en npm |
| `navigation.test.ts` | volver al último paso que preguntó, flujos anidados, Esc y Ctrl+C |
| `session.test.ts`, `login.test.ts` | el token solo va a Contentful; pegarlo, probarlo, guardarlo y cerrar sesión |
| `errors.test.ts` | cancelar y volver en una pregunta |
| `summary.test.ts`, `report-save.test.ts` | el resumen del modelo y dónde se guardan los reportes |
| `pause.test.ts`, `relaunch.test.ts` | la pausa en Windows y la app de Mac que se abre en tu terminal |
| `stale-build.test.ts` | cuándo avisa `cfm` que el build quedó viejo |
| `security.test.ts` | el CLI no llama por su cuenta ningún método del CMA que escribe |
| `architecture.test.ts` | el CLI solo importa el núcleo, `@clack/prompts` y `picocolors`, y todo está en `package.json` |

## Cómo está organizado

Cada comando se lee de arriba abajo en [src/commands/](src/commands/).

```text
package.json         el paquete: el comando (bin), scripts y dependencias
bin/                 lo que se publica para correr cfm (solo eso)
  cfm.mjs            carga dist/cli.js y avisa si el build quedó viejo
  stale-build.mjs    compara las fechas del código y del núcleo con las del build
scripts/             no se publica
  dev.mjs            el script dev: corre src/ sin compilar
  build.mjs          el build, con esbuild
  build-release.mjs  la app de Mac y el ejecutable de Windows, firma y notarización
  entitlements.plist, render-icon.swift
src/
  cli.ts             arranque: corre main y traduce errores a mensajes y códigos de salida
  main.ts            --version, --help, el menú y el comando elegido
  cli-args.ts        la ÚNICA definición de comandos y flags (de ahí salen el menú, la ayuda y la validación)
  app.ts, session.ts, errors.ts, exe.ts
  commands/          un archivo por comando
    context.ts       lo común: sesión y conexión, elegir space y ambientes, confirmar, respaldar y cerrar
    registry.ts      qué función corre cada comando
  selection/         cómo se eligen entries (ID, búsqueda, recientes, tag, archivo, faltantes) y archivos
  report/save.ts     dónde se guardan los reportes
  ui/                la terminal: no decide ni escribe
    views/           tablas por tema: entries, assets, model, summary, entry-diff, status, history, restore
    prompts.ts       las preguntas
    runner.ts        el runner del núcleo, con barra de progreso
test/                los tests (ver arriba)
assets/              el ícono de la app
graphify-out/        el grafo del código, de antes de separar los repositorios
```

Para que Node ejecute los `.ts` sin compilar: los imports propios llevan la extensión `.ts`; solo sintaxis que se puede borrar (nada de `enum`, `namespace` ni parámetros `private`/`readonly` en el constructor; para valores fijos, un objeto `as const` como `MARK` en [ui/table.ts](src/ui/table.ts)); y los tipos se importan con `import type`. tsc avisa si algo no cumple (`erasableSyntaxOnly`).

## Cómo extenderlo

- **Nuevo comando:** agrégalo a `COMMANDS` (y sus flags a `FLAGS`) en [cli-args.ts](src/cli-args.ts), escribe su función en [commands/](src/commands/) con [context.ts](src/commands/context.ts) y regístrala en [registry.ts](src/commands/registry.ts). El menú y la ayuda se actualizan solos.
- **Nueva forma de elegir entries:** en [selection/entries.ts](src/selection/entries.ts); si es una búsqueda, el filtro va en `src/core/query.ts` del núcleo.
- **Cambiar qué se migra** (por ejemplo, que un hijo existente se actualice): en el núcleo, `classifyTree` de `src/core/plan.ts`.
- **Nuevo tipo de escritura:** en el núcleo, un método del writer (`src/contentful/write.ts`), su fase (`src/execute.ts`) y la etapa que la usa (`src/migrations/`).
- **Nueva tabla o columna:** en [ui/views/](src/ui/views/); si también va al reporte, el texto va en `src/text.ts` del núcleo.
- **Cada cambio:** entrada en el [CHANGELOG](CHANGELOG.md) y versión nueva, la misma en el núcleo y aquí.

## Librerías de terminal

La interfaz usa **[@clack/prompts](https://bomb.sh/docs/clack/packages/prompts/)**: preguntas, spinners, barras de progreso y recuadros, todo sobre la misma línea vertical. Las tablas son propias ([ui/table.ts](src/ui/table.ts)). Se evaluaron otras y se descartaron:

| Librería | Por qué no |
| --- | --- |
| commander | `parseArgs` de Node ya maneja comandos y flags, con mensajes en español y tests. |
| Ink | React para la terminal: 20+ dependencias y JSX, que Node no ejecuta sin compilar (rompería el script `dev`). |
| consola | Duplica los logs de clack, y sus prompts están hechos sobre clack. |
| listr2 | Para tareas en paralelo; las escrituras van una por una a propósito, y tomaría el control de la pantalla. |

## Dependencias y seguridad

- El paquete publicado solo instala `picocolors` (lo usa `bin/cfm.mjs`). El núcleo y `@clack/prompts` van dentro del build: son dependencias de desarrollo, como `typescript`, `@types/node`, `@biomejs/biome` y `esbuild`. Todas con versión exacta.
- Sin lockfile, para revisar vulnerabilidades: `npm audit`, `pnpm audit` o `bun audit`.
- Solo esbuild tiene script de instalación (descarga su binario): pnpm necesita `allowBuilds` y `package.json` lo pone en `trustedDependencies` para bun. Si falta, bun 1.4 lo agrega solo al instalar y el lint falla.
- Lo que se publica (`bin/`, `dist/`, CHANGELOG, README y LICENSE) lo revisa [test/app.test.ts](test/app.test.ts).

## Ejecutables para Mac y Windows

Se generan en un Mac (la app de Mac solo se arma ahí) con `bun run build:release` (o `npm run build:release`…). Compila con bun, así que hace falta tenerlo instalado aunque uses otro gestor. Quedan en `release/`, que no se sube:

| Archivo | Para | Tamaño |
| --- | --- | --- |
| `cfm.app` | macOS 13 o superior, Apple Silicon e Intel | ~129 MB |
| `cfm-mac.zip` | la app comprimida, para repartirla | ~48 MB |
| `cfm-windows.exe` | Windows 10 y 11, 64 bits | ~121 MB (~40 MB en zip) |

- Cada uno lleva la versión con la que se generó: después de un cambio, vuelve a generarlos.
- **Ícono:** [assets/icon.svg](assets/icon.svg). Si lo cambias, `swift scripts/render-icon.swift` regenera `assets/icon.png`, que es el que usa el build.
- **Firma en Mac:** `build:release` busca un certificado **Developer ID Application** en el llavero (o el de `CFM_SIGN_IDENTITY`). Con certificado, firma para repartir (hardened runtime y los permisos de [scripts/entitlements.plist](scripts/entitlements.plist)); sin certificado, firma solo para este Mac. Para notarizarla y que abra en cualquier Mac sin avisos:

  ```bash
  # una vez: tu Apple ID, el Team ID y una contraseña de app (appleid.apple.com), en el llavero
  xcrun notarytool store-credentials cfm-notary --apple-id <correo> --team-id <TEAM_ID>
  CFM_NOTARY_PROFILE=cfm-notary bun run build:release
  ```

- **Windows:** el `.exe` no está firmado, y el ícono y los datos del archivo solo se pueden poner compilando en Windows (bun no lo permite desde un Mac).

## Cambiar de gestor de paquetes

1. Quita el comando con el gestor anterior (fila *Quitar el comando* de arriba).
2. Borra lo que instaló: `rm -rf node_modules package-lock.json pnpm-lock.yaml bun.lock bun.lockb` (en PowerShell: `Remove-Item -Recurse -Force node_modules, package-lock.json, pnpm-lock.yaml, bun.lock, bun.lockb -ErrorAction SilentlyContinue`).
3. Instala las dependencias y el comando con el nuevo.

## Pasarle el proyecto a otra persona

Lo normal es clonar el repositorio: [github.com/alejandrodotor8/cmtool-cli](https://github.com/alejandrodotor8/cmtool-cli). Si no puede, como archivo: con historial, `git bundle create cfm.bundle --all` (lo clona con `git clone cfm.bundle cmtool-cli`); sin historial, un zip de la carpeta **sin** `node_modules` ni lockfiles. El núcleo lo descarga solo desde npm.

# ctf-migrate

Migra entries de Contentful entre ambientes (por ejemplo, un banner de `develop` a `qa`), junto con sus hijos. **Todo queda en draft.**

## Requisitos

- **Node 22.18 o superior** (recomendado 24). La herramienta siempre corre con Node, que ejecuta TypeScript directo, sin compilar.
- **Un gestor de paquetes, el que prefieras**: npm (viene con Node), pnpm o bun. El proyecto no obliga a ninguno y no sube lockfiles: cada quien instala con el suyo.
- Una **sesión de Contentful** (`contentful login`) o un token de administración.

## Instalación (una sola vez)

### 1. Node y tu gestor de paquetes

**macOS**

```bash
fnm install 24                                   # Node con fnm; el proyecto trae .node-version
corepack enable pnpm                             # solo si usas pnpm (o: brew install pnpm)
curl -fsSL https://bun.sh/install | bash         # solo si usas bun (o: brew install oven-sh/bun/bun)
```

**Windows** — usa **Windows Terminal con PowerShell** (viene en Windows 11). En el `cmd` antiguo la herramienta funciona, pero algunos símbolos de las tablas (✔ ✖ ≠ ↗) pueden verse como cuadritos.

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned   # una sola vez: sin esto PowerShell bloquea npm/pnpm ("running scripts is disabled")
winget install OpenJS.NodeJS.LTS                       # Node (trae npm)
winget install pnpm.pnpm                               # solo si usas pnpm
winget install Oven-sh.Bun                             # solo si usas bun
```

Cierra y abre la terminal después de instalar.

**Solo pnpm**: la primera vez corre `pnpm setup` y abre una terminal nueva, para que sus comandos globales queden en el PATH.

### 2. Contentful CLI e inicio de sesión

Se abre el navegador para autorizar. La sesión queda en `~/.contentfulrc.json` (en Windows, `C:\Users\<usuario>\.contentfulrc.json`).

| npm | pnpm | bun |
| --- | --- | --- |
| `npm install -g contentful-cli` | `pnpm add -g contentful-cli` | `bun add -g contentful-cli` |

Después, con cualquiera: `contentful login`.

### 3. La herramienta

Desde la carpeta del proyecto, con tu gestor:

| | npm | pnpm | bun |
| --- | --- | --- | --- |
| **Instalar dependencias** | `npm install` | `pnpm install` | `bun install` |
| **Compilar (build)** | `npm run build` | `pnpm build` | `bun run build` |
| **Instalar los comandos** | `npm link` | `pnpm add -g "link:$PWD"` | `bun link` |
| **Quitar los comandos** | `npm rm -g ctf-migrate` | `pnpm rm -g ctf-migrate` | `bun unlink` (desde la carpeta) |
| **Correr el build sin instalar** | `npm start -- --dry-run` | `pnpm start --dry-run` | `bun run start --dry-run` |
| **Correr el código fuente sin instalar** | `npm run dev -- --dry-run` | `pnpm dev --dry-run` | `bun run dev --dry-run` |

Los comandos son los mismos en macOS y Windows (en PowerShell, `$PWD` también es la carpeta actual).

- **Se instalan dos comandos** (ver [Build y desarrollo](#build-y-desarrollo)): `ctf-migrate`, que corre el build, y `ctf-migrate-dev`, que corre el código fuente.
- **El comando es un enlace a esta carpeta, no una copia.** Por eso con pnpm se usa `link:` (en pnpm 10+ ya no existe `pnpm link --global`). `ctf-migrate-dev` además lo necesita: Node no ejecuta `.ts` dentro de `node_modules`.
- **Instala los comandos con un solo gestor.** Si tienes dos instalaciones, gana la que esté primero en el PATH y es fácil confundirse.

### Cambiar de gestor de paquetes

1. Quita el comando con el gestor anterior (fila **Quitar el comando**).
2. Borra lo que instaló:

   ```bash
   # macOS
   rm -rf node_modules package-lock.json pnpm-lock.yaml bun.lock bun.lockb
   ```

   ```powershell
   # Windows (PowerShell)
   Remove-Item -Recurse -Force node_modules, package-lock.json, pnpm-lock.yaml, bun.lock, bun.lockb -ErrorAction SilentlyContinue
   ```

3. Instala dependencias y el comando con el nuevo gestor.

### Sin el Contentful CLI

Crea un token en Contentful (*Settings → CMA tokens*) y defínelo en la terminal antes de correr:

| Sistema | Comando |
| --- | --- |
| macOS | `export CONTENTFUL_MANAGEMENT_TOKEN=<token>` |
| Windows (PowerShell) | `$env:CONTENTFUL_MANAGEMENT_TOKEN = "<token>"` |

### Build y desarrollo

| Comando | Qué corre | Cuándo cambia |
| --- | --- | --- |
| `ctf-migrate` | el **build**: JavaScript compilado en `dist/` | solo cuando vuelves a correr el script `build` |
| `ctf-migrate-dev` | el **código fuente** de `src/`, sin compilar | al instante, con cada cambio que guardes |

- Usa **`ctf-migrate`** para trabajar: no le afectan los cambios a medio hacer ni cambiar de rama en git.
- Usa **`ctf-migrate-dev`** mientras programas: lo indica en la cabecera con *[desarrollo: código fuente]*.
- **Después de actualizar el código** (cambiar de rama, fusionar, recibir una versión nueva), vuelve a correr el script `build` para que `ctf-migrate` use lo nuevo.
- Si corres `ctf-migrate` sin haber compilado, te dice que corras el `build` (o que uses `ctf-migrate-dev`).
- Si el código de `src/` es más nuevo que el build, `ctf-migrate` **avisa** antes de empezar (y sigue corriendo la versión anterior).
- **No hace falta volver a instalar los comandos** después de un build: apuntan a esta carpeta y toman el `dist/` nuevo. Solo hay que repetir la instalación si mueves la carpeta, si cambian los comandos en `package.json` o, con npm, si cambias de versión de Node.
- `dist/` no se sube al repo: cada quien lo genera con su gestor.

### Notas

- **npm y fnm/nvm**: con `npm link` el comando queda instalado en la versión de Node activa; si cambias de versión, repite `npm link`. Con pnpm y bun el comando usa el `node` que tengas activo.
- **Error 401**: la sesión expiró. Vuelve a correr `contentful login`.
- **Sin lockfile**, las dependencias directas están fijadas a versiones exactas en `package.json`. Para revisar vulnerabilidades: `npm audit`, `pnpm audit` o `bun audit`.

### Pasarle el proyecto a otra persona

No hay repositorio remoto, así que se comparte como archivo:

- **Con historial de git** (recomendado): `git bundle create ctf-migrate.bundle --all`. La otra persona lo clona con `git clone ctf-migrate.bundle ctf-migrate`.
- **Sin historial**: un zip de la carpeta **sin** `node_modules` ni lockfiles.

Después sigue los pasos de instalación con su sistema y su gestor.

## Uso

```bash
ctf-migrate
```

1. Elige el **space**.
2. Elige el ambiente **origen** y el **destino**.
3. Pega uno o varios **entry IDs**. También acepta la **URL de la entry** tal como la copias del navegador (`https://app.contentful.com/spaces/…/entries/<entry id>`).
   - Uno por línea, o separados por coma, punto y coma, espacio o tabulación: puedes **pegar una columna o una fila de Excel**.
   - **Enter** agrega una línea. Para continuar, presiona **Tab** (va al botón `[ submit ]`) y luego **Enter**. Así, una celda vacía en lo que pegas no envía la respuesta antes de tiempo.
   - Si algo no tiene forma de entry ID (por ejemplo, la URL de un asset), te dice cuál y te deja pegar de nuevo. Si varios IDs no existen en origen, te los lista todos.
4. Revisa el árbol: la entry que pegaste (**padre**) y las entries a las que apunta (**hijos**).
   - El padre se crea o, si ya existe en destino, se actualiza.
   - Un hijo que ya existe en destino **se reutiliza sin tocarlo**. Igual se muestra lo que tiene debajo y se revisa su modelo.
   - Un hijo que no existe en destino se crea, y se revisan sus propios hijos con la misma regla.
   - Para actualizar un hijo que ya existe, pega también su ID.
   - Un **texto enlazado** dentro de un rich text (`↗`) no es un hijo: no se migra. Si apunta a una entry que no existe en destino, te avisa que el enlace quedará roto.
   - Si una entry está **archivada** en destino, no se actualiza (y si es un hijo reutilizado, te avisa que el padre no se podrá publicar).
   - Si se van a escribir más de 20 entries, te pide confirmar que el árbol es lo que esperabas.
5. **Imágenes**: si faltan imágenes en destino, te pregunta si migrar con imágenes. Si dices que sí, reutiliza las que ya existen y crea las que faltan.
6. **Modelo**: compara el modelo de padres e hijos con el de destino y te muestra:
   - campos que **faltan** en destino → eliges cuáles agregar (si no marcas nada, no se toca el modelo y esos campos no se migran);
   - campos que **sobran** en destino → no se tocan y conservan su valor;
   - campos con **otro tipo** → no se migran;
   - campos con el mismo tipo pero **reglas distintas** (`!`): obligatorio solo en destino, localizado en origen pero no en destino (solo se copia el locale por defecto) o validaciones distintas (tipos de entry permitidos, tamaño, formato…);
   - content types que **no existen** en destino → eliges si crearlos (si no, esas entries no se migran).
7. Revisa el **resumen** y confirma. El resumen avisa qué entries quedarán con **campos obligatorios vacíos** en destino (no se podrán publicar hasta completarlos). Revisa el idioma por defecto y los idiomas que en destino no permiten campos vacíos. Si el destino parece producción (es `master` o tiene un alias), tienes que escribir el nombre del ambiente para confirmar.
8. Al terminar te dice dónde quedó el **respaldo** de la migración.

### Sin pasar por los menús

```bash
ctf-migrate --space <space> --from develop --to qa --ids 5NIY0nRGNkKvvjO8yc8Pp1,otroId
```

`--space`, `--from`, `--to` e `--ids` reemplazan las primeras preguntas (`--from`/`--to` aceptan aliases como `master`). Las preguntas de imágenes y modelo, y la confirmación final, se hacen siempre. Al terminar, la herramienta imprime el comando equivalente (**"Para repetir: …"**) para que puedas copiarlo.

### Ver cada llamada a la API: `--verbose`

```bash
ctf-migrate --verbose
```

Muestra cada llamada (método, ruta y parámetros; nunca headers ni token). Siempre, al terminar, dice cuántas llamadas se hicieron.

`ctf-migrate --help` muestra todas las opciones.

### Probar sin escribir: `--dry-run`

```bash
ctf-migrate --dry-run
```

Hace todo el análisis, muestra las tablas y el resumen, y se detiene ahí. No escribe nada en Contentful ni crea respaldo.

### Deshacer una migración: `restore`

```bash
ctf-migrate restore                 # elige el respaldo de una lista
ctf-migrate restore <respaldo.json> # o indica el archivo
ctf-migrate restore --dry-run       # muestra qué restauraría, sin escribir
```

Cada migración guarda un respaldo en `~/.ctf-migrate/backups/` (en Windows, `C:\Users\<usuario>\.ctf-migrate\backups\`). Antes de actualizar una entry que ya existía en destino, guarda cómo estaba; si no puede guardarlo, no la actualiza.

`restore` devuelve esas entries a como estaban:

- Si alguien editó o publicó la entry **después** de la migración, te avisa: restaurar también deshace esos cambios.
- Si la entry ya no existe en destino, la omite.
- Si durante la migración la actualización de una entry falló, no hay nada que deshacer: la omite.
- Lo que la migración **creó** (entries, imágenes, tags, content types, campos del modelo) **no se borra**, porque la herramienta nunca borra. Te lo lista para que decidas en Contentful.
- El restore también guarda su propio respaldo, así que se puede deshacer.

## Garantías

- Nunca publica entries ni assets.
- El modelo solo cambia si marcas campos o content types para agregar. Nunca borra ni modifica campos existentes. Lo que agregues sí se publica, porque Contentful lo exige para poder usar esos campos.
- Si una entry ya existe en destino, se actualizan solo los campos que existen en ambos modelos con el mismo tipo. Los campos que solo existen en destino conservan su valor.
- Si una entry ya existe y está publicada, queda como **Changed**: lo publicado sigue en vivo.
- Los tags que falten en destino se crean.
- Antes de actualizar una entry existente, guarda cómo estaba (ver `restore`).
- Justo antes de escribir vuelve a mirar destino: si algo del árbol apareció, desapareció o se archivó mientras revisabas, se detiene sin escribir.
- Si el árbol pasa de 300 entries, se detiene: seguramente un link está arrastrando una página entera. Los límites están en [src/config.ts](src/config.ts).

## Seguridad

- **Un solo módulo escribe**: [src/contentful/write.ts](src/contentful/write.ts). Queda atado al ambiente destino y no tiene forma de borrar, archivar, despublicar ni escribir en origen. Lo verifica [test/security.test.ts](test/security.test.ts) sobre el código fuente: si alguien agrega una escritura en otro archivo, los tests fallan.
- **El token solo va a Contentful**: se lee de `CONTENTFUL_MANAGEMENT_TOKEN` o de `~/.contentfulrc.json` y solo se envía a `api.contentful.com` o `api.eu.contentful.com`. Si el archivo de sesión apunta a otro host, la herramienta se detiene. Los mensajes de error nunca imprimen la request (que lleva el token).
- **Las imágenes solo se copian desde el CDN de Contentful** (`*.ctfassets.net`, por https).
- **Nada se escribe antes de confirmar**: todo lo anterior al resumen es solo lectura.
- **Dependencias**: solo 3 para correr (`contentful-management`, `@clack/prompts`, `picocolors`) y 3 de desarrollo (`typescript`, `@types/node`, `@biomejs/biome`), todas con versión exacta. Ninguna tiene scripts de instalación. El paquete es `private` para que no se publique en npm por error.

## Cómo está organizado

Cada comando se lee de arriba abajo en [src/commands/](src/commands/). El código está separado por responsabilidad: lo que lee, lo que decide, lo que muestra y lo que escribe.

```text
bin/
  ctf-migrate.mjs        comando del build: carga dist/cli.js (avisa si el build quedó viejo)
  stale-build.mjs        compara las fechas de src/ y del build
  ctf-migrate-dev.mjs    comando de desarrollo: carga src/cli.ts sin compilar
dist/                    build generado (no se sube); tsconfig.build.json lo configura
src/
  cli.ts                 arranque: corre main y traduce errores a mensajes y códigos de salida
  main.ts                lee los argumentos y corre el comando
  cli-args.ts            argumentos (--space/--from/--to/--ids, --dry-run, --verbose, restore)
  commands/
    migrate.ts           ctf-migrate: el flujo de migración, paso a paso
    restore.ts           ctf-migrate restore: deshace una migración
  backup.ts              respaldos locales en ~/.ctf-migrate/backups/
  config.ts              límites de seguridad (tamaño del árbol, confirmación)
  session.ts             token y host (sesión del CLI o variable de entorno)
  errors.ts              AbortError y formato de errores del CMA
  analyze.ts             paso de análisis: arma todo lo que se muestra (solo lectura)
  execute.ts             paso final: aplica el plan con el writer
  contentful/
    types.ts             tipos de Contentful con nombres cortos
    client.ts            cliente del CMA; describe cada llamada para --verbose (sin headers)
    read.ts              lecturas (árbol de entries, modelos, locales, assets, tags)
    write.ts             ÚNICO módulo que escribe en Contentful
  core/                  reglas puras: sin red, sin terminal
    plan.ts              qué se crea, actualiza, reutiliza; plan de escritura
    model.ts             comparación de content types campo por campo (tipo y reglas)
    publish-check.ts     campos que se escriben; obligatorios que quedarían vacíos
    fields.ts            valores de origen → formato de destino (locales, merge, assets)
    entries.ts           links, hijos, imágenes y título de una entry
    ids.ts               parseo de IDs/URLs pegados
    restore.ts           qué se restaura y qué cambió después
    environments.ts      ambiente por ID o alias
  ui/                    terminal: no decide ni escribe
    views.ts             tablas de entries, imágenes, modelo y resumen
    prompts.ts           preguntas al usuario
    table.ts             dibujo de tablas
    log.ts               mensajes de estado
    header.ts            inicio y cierre de cada comando (avisa --dry-run y modo desarrollo)
    runner.ts            ejecuta escrituras por fases, con barra de progreso y lista de ✔ / ✖
    status.ts            spinner para los pasos que llaman a la API
    api-calls.ts         cuenta las llamadas a la API (y las muestra con --verbose)
```

## Desarrollo

El código es TypeScript. `ctf-migrate-dev` lo ejecuta directo (Node quita los tipos al vuelo): editas un `.ts` y lo corres. `ctf-migrate` usa el build, que se regenera con el script `build`.

Con tu gestor (`npm run …`, `pnpm …` o `bun run …`):

| Script | Qué hace |
| --- | --- |
| `typecheck` | revisa tipos con tsc (no genera archivos) |
| `lint` | lint + formato con Biome |
| `format` | aplica el formato y los arreglos automáticos de Biome |
| `test` | tests (`node:test`, sin dependencias extra) |
| `check` | typecheck + lint + tests; córrelo antes de hacer commit |
| `build` | compila `src/` a `dist/` (lo que corre `ctf-migrate`) |
| `start` | corre el build desde la carpeta, sin el comando global |
| `dev` | corre el código fuente desde la carpeta, sin el comando global |

Por ejemplo: `npm run check`, `pnpm check` o `bun run check`. Los tests siempre corren con Node (`node --test`), también con bun.

Los tests son **unitarios**: prueban las reglas y utilidades, no hacen migraciones reales. Viven en `test/` y usan objetos armados a mano (`test/fixtures.ts`) y un CMA falso en memoria que registra cada llamada. Además, [test/setup.ts](test/setup.ts) se carga antes de cada archivo de test y garantiza que:

- **No hay red**: cualquier conexión (http, https, fetch, sockets) falla, así que ningún test puede llegar a Contentful.
- **No se toca tu carpeta personal**: los tests ven una carpeta temporal como HOME (sin tu sesión, tu token ni tus respaldos) y escriben solo en carpetas temporales que se borran al terminar.

`isolation.test.ts` verifica que esa protección esté activa. Los tests cubren:

- **Reglas de migración** (`plan.test.ts`): qué se crea, actualiza, reutiliza o no se crea; qué se ofrece agregar al modelo; el plan final.
- **Transformación de valores** (`fields.test.ts`): locales, merge con la entry existente y assets.
- **Modelo, links e IDs** (`model.test.ts`, `entries.test.ts`, `ids.test.ts`).
- **Seguridad**: el writer solo escribe en destino y solo publica content types (`write.test.ts`); el token solo va a hosts de Contentful (`session.test.ts`); los errores no muestran el token (`errors.test.ts`); los archivos solo se copian desde el CDN de Contentful (`fields.test.ts`).
- **Lectura del árbol** (`read.test.ts`): por niveles, links rotos y ciclos.
- **Respaldo y restore** (`backup.test.ts`, `restore.test.ts`, `write.test.ts`): el respaldo se guarda antes de actualizar y, si falla, no se actualiza; detecta cambios posteriores a la migración.
- **Argumentos y flags** (`cli-args.test.ts`, `environments.test.ts`): incluido que el comando "Para repetir" se vuelve a leer igual.
- **Código fuente** (`security.test.ts`): solo el writer escribe, nunca borra/archiva/despublica, y solo publica content types. `client.test.ts`: `--verbose` nunca muestra el token.
- **Comportamiento** (`entries.test.ts`, `read.test.ts`, `plan.test.ts`, `errors.test.ts`): textos enlazados que no son hijos, límite del árbol, entries archivadas, cambios en destino durante la revisión y conflictos de versión.
- **Reglas del modelo y publicación** (`model.test.ts`, `publish-check.test.ts`): obligatorio, localizado y validaciones; qué entries quedan con obligatorios vacíos; los campos que solo existen en destino no se tocan.

Reglas para que Node pueda ejecutar los `.ts` sin compilar:

- Los imports llevan la extensión `.ts` (`import { x } from './core/plan.ts'`).
- Solo sintaxis que se puede borrar: nada de `enum`, `namespace` ni parámetros con `private`/`readonly` en el constructor. Para valores fijos usa un objeto `as const`, como `ACTION` en [src/core/plan.ts](src/core/plan.ts). `tsc` avisa si algo no cumple (`erasableSyntaxOnly`).
- Los tipos se importan con `import type`.

### Librerías de terminal

La interfaz usa **[@clack/prompts](https://bomb.sh/docs/clack/packages/prompts/)**: preguntas (selector con búsqueda, checks agrupados, texto de varias líneas, confirmaciones), spinners, barras de progreso y recuadros, todo sobre la misma línea vertical. Se evaluaron otras y se descartaron:

| Librería | Decisión | Por qué |
| --- | --- | --- |
| **@clack/prompts** | ✔ Se usa | Cubre todas las preguntas y los indicadores de progreso con un solo estilo; 4 dependencias pequeñas, sin scripts de instalación. |
| commander | ✖ | `parseArgs` de Node ya maneja los comandos y flags, con mensajes en español y tests. Commander sumaría una dependencia y mensajes en inglés sin mejorar la experiencia. |
| Ink | ✖ | React para la terminal, pensado para pantallas completas. Trae 20+ dependencias más React y usa JSX, que Node no ejecuta sin compilar (rompería `ctf-migrate-dev`). El flujo es un asistente paso a paso: lo que hace clack. |
| consola | ✖ | Sus logs duplican los de clack y sus prompts están hechos sobre clack: dos estilos para lo mismo. |
| listr2 | ✖ | Para árboles de tareas en paralelo. Las escrituras van una por una a propósito; la barra de progreso de clack lo cubre con el mismo estilo, y listr2 tomaría el control de la pantalla. |

Las tablas (árbol, imágenes, modelo, resumen) son propias ([src/ui/table.ts](src/ui/table.ts)) y se dibujan sobre la misma línea vertical de clack.

### Cómo extenderlo

- **Cambiar qué se migra** (por ejemplo, que un hijo existente se actualice): `classifyTree` en [src/core/plan.ts](src/core/plan.ts).
- **Nueva pregunta al usuario**: una función en [src/ui/prompts.ts](src/ui/prompts.ts), su respuesta va a `buildPlan`.
- **Nuevo tipo de escritura** (por ejemplo, copiar locales): un método en [src/contentful/write.ts](src/contentful/write.ts) y su paso en [src/execute.ts](src/execute.ts).
- **Nueva tabla o columna**: [src/ui/views.ts](src/ui/views.ts).

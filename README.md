# cfm

_Antes se llamaba `ctf-migrate`._

Migra entries de Contentful entre ambientes (por ejemplo, un banner de `develop` a `qa`), junto con sus hijos. **Todo queda en draft.**

Este repositorio es **`cmtool-cli`**: el comando `cfm`, la app de Mac y el ejecutable de Windows. Toda la lógica (leer, comparar, planear, escribir y respaldar) está en el núcleo, **`cmtool-core`**, que es un paquete de npm aparte. Aquí solo están las preguntas, las tablas y los archivos.

| Repositorio | Paquete de npm | Qué es |
| --- | --- | --- |
| `cmtool-core` | `cmtool-core` | El núcleo: toda la lógica, sin pantalla ni terminal. Lo usan el CLI y la web. |
| **`cmtool-cli`** (este) | `cmtool-cli` | La terminal: el comando `cfm`. |
| `backoffice-b2c` | — | El back office web (Next.js), en construcción. |

Son tres repositorios independientes: el CLI usa el núcleo como cualquier dependencia de npm, y ninguno necesita la carpeta de otro para instalar, compilar ni correr sus tests.

## Requisitos

- **Node 22.18 o superior** (recomendado 24).
- **Un gestor de paquetes, el que prefieras**: npm (viene con Node), pnpm, yarn 1 o bun. El proyecto no obliga a ninguno y no sube lockfiles: cada quien instala con el suyo.
- Una **cuenta de Contentful**. Si no encuentra tu sesión, la primera vez te pide un token y lo guarda (ver [Sin el Contentful CLI](#sin-el-contentful-cli)); también sirve `contentful login`.

¿Para alguien que no va a instalar Node ni el proyecto? Mira [Ejecutables para Mac y Windows](#ejecutables-para-mac-y-windows).

## Instalación

### Desde npm

Cuando `cmtool-cli` esté publicado (ver [PUBLICAR.md](PUBLICAR.md)):

| | npm | pnpm | bun |
| --- | --- | --- | --- |
| **Instalar** | `npm install -g cmtool-cli` | `pnpm add -g cmtool-cli` | `bun add -g cmtool-cli` |
| **Actualizar** | `npm install -g cmtool-cli@latest` | `pnpm add -g cmtool-cli@latest` | `bun add -g cmtool-cli@latest` |
| **Quitar** | `npm rm -g cmtool-cli` | `pnpm rm -g cmtool-cli` | `bun rm -g cmtool-cli` |

Instala el comando `cfm`. No descarga el núcleo ni las librerías de la terminal, porque ya van dentro del build; solo trae `picocolors`. `cfm-dev` también se instala, pero solo funciona desde el repositorio (ver [Build y desarrollo](#build-y-desarrollo)).

### Desde el código (para desarrollar)

#### 1. Node y tu gestor de paquetes

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

#### 2. Contentful CLI e inicio de sesión (opcional)

Si no lo instalas, la primera vez que abras `cfm` te pide pegar un token ([Sin el Contentful CLI](#sin-el-contentful-cli)).

Se abre el navegador para autorizar. La sesión queda en `~/.contentfulrc.json` (en Windows, `C:\Users\<usuario>\.contentfulrc.json`).

| npm | pnpm | bun |
| --- | --- | --- |
| `npm install -g contentful-cli` | `pnpm add -g contentful-cli` | `bun add -g contentful-cli` |

Después, con cualquiera: `contentful login`.

#### 3. La herramienta

Desde la carpeta del repositorio, con tu gestor:

| | npm | pnpm | bun |
| --- | --- | --- | --- |
| **Instalar dependencias** | `npm install` | `pnpm install` | `bun install` |
| **Compilar (build)** | `npm run build` | `pnpm build` | `bun run build` |
| **Instalar los comandos** | `npm link` | `pnpm add -g "link:$PWD"` | `bun link` |
| **Quitar los comandos** | `npm rm -g cmtool-cli` | `pnpm rm -g cmtool-cli` | `bun unlink` |
| **Correr el build sin instalar** | `npm start -- --dry-run` | `pnpm start --dry-run` | `bun run start --dry-run` |
| **Correr el código fuente sin instalar** | `npm run dev -- --dry-run` | `pnpm dev --dry-run` | `bun run dev --dry-run` |

`npm install` (o el de tu gestor) descarga el núcleo, `cmtool-core`, desde npm: no hace falta tener su repositorio.

Los comandos son los mismos en macOS y Windows (en PowerShell, `$PWD` también es la carpeta actual).

- **Se instalan dos comandos** (ver [Build y desarrollo](#build-y-desarrollo)): `cfm`, que corre el build, y `cfm-dev`, que corre el código fuente.
- **El comando es un enlace a la carpeta del repositorio, no una copia.** Por eso con pnpm se usa `link:` (en pnpm 10+ ya no existe `pnpm link --global`). `cfm-dev` además lo necesita: Node no ejecuta `.ts` dentro de `node_modules`.
- **Instala los comandos de una sola forma.** Si tienes dos instalaciones (por ejemplo, `bun link` desde el repo y `npm install -g cmtool-cli`), gana la que esté primero en el PATH y es fácil confundirse.
- **yarn 1** también sirve para instalar dependencias y correr los scripts (`yarn install`, `yarn build`, `yarn run check`; ojo: `yarn check` a secas es un comando propio de yarn y no corre el nuestro). Para instalar los comandos, usa `npm link`.
- **Si lo instalaste antes de la 0.17.0**, el comando apunta a la carpeta del proyecto anterior: quítalo y vuelve a instalarlo desde este repo. Con npm: `npm rm -g cfm`; con pnpm: `pnpm rm -g cfm`; con bun: borra `~/.bun/bin/cfm`, `~/.bun/bin/cfm-dev` y `~/.bun/install/global/node_modules/cfm` (son enlaces).

### Cambiar de gestor de paquetes

1. Quita el comando con el gestor anterior (fila **Quitar los comandos**).
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

Si `cfm` no encuentra tu sesión, la primera vez te pregunta cómo entrar:

- **Crear un token en Contentful y pegarlo aquí**: abre Contentful en el navegador para que crees un token personal (*Create personal access token*). Lo copias y lo pegas.
- **Ya tengo un token: pegarlo aquí**.
- **Iniciar sesión con el Contentful CLI**: termina y te dice que corras `contentful login`.

El token pegado no se ve en pantalla. `cfm` lo prueba con Contentful (y reconoce si es de la región EU) y lo guarda **donde lo guarda `contentful login`**, con el mismo formato: `~/.contentfulrc.json` (o el `.contentfulrc.json` de la carpeta, o `CONTENTFUL_CONFIG_FILE`). El archivo queda con permiso de lectura solo para tu usuario. La siguiente vez ya no pregunta, y el Contentful CLI también lo usa.

Para cambiarlo (por ejemplo, si venció): `cfm login`, o **Iniciar sesión** en el menú.

Para salir: `cfm logout`, o **Cerrar sesión** en el menú. Quita el token del archivo (como `contentful logout`) y deja lo demás. Como el archivo es el mismo, también cierra la sesión del Contentful CLI. El token sigue existiendo en Contentful: si no lo vas a usar más, revócalo allá (*Account settings → CMA tokens*).

También puedes definir el token en la terminal; tiene prioridad sobre el archivo:

| Sistema | Comando |
| --- | --- |
| macOS | `export CONTENTFUL_MANAGEMENT_TOKEN=<token>` |
| Windows (PowerShell) | `$env:CONTENTFUL_MANAGEMENT_TOKEN = "<token>"` |

### Build y desarrollo

| Comando | Qué corre | Cuándo cambia |
| --- | --- | --- |
| `cfm` | el **build**: el CLI y el núcleo empaquetados en un solo archivo, `dist/cli.js` (arranca más rápido) | solo cuando vuelves a correr el script `build` |
| `cfm-dev` | el **código fuente** del CLI, sin compilar; el núcleo, compilado, desde `node_modules` | al instante, con cada cambio que guardes en `src/` |

- Usa **`cfm`** para trabajar: no le afectan los cambios a medio hacer ni cambiar de rama en git.
- Usa **`cfm-dev`** mientras programas: lo indica en la cabecera con *[desarrollo: código fuente]*. Solo funciona desde el repositorio: instalado desde npm no hay `src/`, y lo dice.
- **Después de actualizar el código** (cambiar de rama, fusionar, recibir una versión nueva o actualizar `cmtool-core`), vuelve a correr el script `build` para que `cfm` use lo nuevo.
- Si corres `cfm` sin haber compilado, te dice que corras el `build` (o que uses `cfm-dev`).
- Si el código de `src/` o el núcleo instalado son más nuevos que el build, `cfm` **avisa** antes de empezar (y sigue corriendo la versión anterior). Pasa, por ejemplo, si recompilas el núcleo enlazado y no este repo.
- **No hace falta volver a instalar los comandos** después de un build: apuntan a la carpeta del repo y toman el `dist/` nuevo. Solo hay que repetir la instalación si mueves la carpeta, si cambian los comandos en `package.json` o, con npm, si cambias de versión de Node.
- `dist/` no se sube al repo: cada quien lo genera con su gestor. Al publicar en npm se genera solo (ver [PUBLICAR.md](PUBLICAR.md)).
- `pnpm-workspace.yaml` es solo para quien use pnpm: le permite a esbuild (el empaquetador del build) correr su instalación. npm, yarn y bun lo ignoran.
- **Por qué un solo archivo**: el build junta el código, el núcleo y sus dependencias (contentful-management, axios…) con esbuild. Así `cfm` abre ~20 archivos al arrancar en vez de ~440, que era lo que hacía lenta la primera ejecución (con el disco en frío, cada archivo cuenta). `cfm-dev` sigue leyendo los archivos sueltos, así que arranca más lento.
- **Mientras ves el menú**, la herramienta ya se conecta con Contentful y trae tus spaces (y los ambientes, si ya se sabe el space). Al elegir, normalmente ya están listos. Con `--verbose` no lo hace, para no mezclar líneas con el menú.

### Notas

- **npm y fnm/nvm**: con `npm link` el comando queda instalado en la versión de Node activa; si cambias de versión, repite `npm link`. Con pnpm y bun el comando usa el `node` que tengas activo.
- **Error 401**: la sesión expiró o el token ya no sirve. Pega uno nuevo con `cfm login` (o vuelve a correr `contentful login`).
- **Sin lockfile**, las dependencias directas están fijadas a versiones exactas en `package.json`. Para revisar vulnerabilidades: `npm audit`, `pnpm audit` o `bun audit`.

### Pasarle el proyecto a otra persona

Lo normal es clonar el repositorio. Si todavía no está en un remoto, se comparte como archivo:

- **Con historial de git** (recomendado): `git bundle create cfm.bundle --all`. La otra persona lo clona con `git clone cfm.bundle cmtool-cli`.
- **Sin historial**: un zip de la carpeta **sin** `node_modules` ni lockfiles.

Mientras `cmtool-core` no esté en npm, pásale también el repo del núcleo, en una carpeta al lado. Después sigue los pasos de instalación con su sistema y su gestor.

### Ejecutables para Mac y Windows

Para quien no va a instalar Node ni el proyecto: una app para Mac y un ejecutable para Windows, que se abren con doble clic. Se generan desde la carpeta del repo, en un Mac (la app de Mac solo se arma ahí), con tu gestor: `npm run build:release`, `pnpm build:release`, `yarn build:release` o `bun run build:release`. Compila con bun, así que hace falta tenerlo instalado, aunque instales las dependencias con otro gestor.

Quedan en `release/` (no se sube al repo):

| Archivo | Para | Tamaño |
| --- | --- | --- |
| `cfm.app` | Mac con macOS 13 o superior, Apple Silicon e Intel, con ícono | ~129 MB |
| `cfm-mac.zip` | la app comprimida, para repartirla | ~48 MB |
| `cfm-windows.exe` | Windows 10 y 11, 64 bits | ~121 MB (~40 MB en zip) |

En los dos:

- **Sesión**: la primera vez pide el token y lo guarda ([Sin el Contentful CLI](#sin-el-contentful-cli)); no hace falta instalar nada más. Es la misma sesión de `cfm` y de `contentful login` (`~/.contentfulrc.json`), y los respaldos también son los mismos (`~/.ctf-migrate/backups`).
- Cada uno lleva la versión con la que se generó (se ve en el encabezado): después de un cambio, vuelve a generarlos.
- No se publican en npm: se reparten como archivo.

**Mac (`cfm.app`)**

- **Instalar**: descomprime `cfm-mac.zip` y arrastra `cfm.app` a *Aplicaciones*. Se abre con doble clic, desde Launchpad o con Spotlight: abre el menú en **tu terminal**, la que macOS usa para abrir ejecutables (Warp, iTerm… o Terminal, si no elegiste otra). Para cambiarla: en Finder, *Obtener información* de cualquier ejecutable → *Abrir con* → *Cambiar todo*. Si esa terminal no puede abrirlo, usa Terminal.
- **Actualizar**: arrastra la nueva a *Aplicaciones* y elige **Reemplazar** (cierra antes la ventana de `cfm` si está abierta). La sesión y los respaldos están fuera de la app, así que no se pierde nada. La versión instalada se ve en el encabezado y en Finder (*Obtener información*).
- **Desde una terminal** acepta los mismos comandos y flags que `cfm`: `/Applications/cfm.app/Contents/MacOS/cfm migrate --dry-run`.
- **Ícono**: [assets/icon.svg](assets/icon.svg). Si lo cambias, `swift scripts/render-icon.swift` regenera `assets/icon.png`, que es el que usa el build.
- **Firma**: `build:release` busca un certificado **Developer ID Application** en el llavero (o usa el que digas en `CFM_SIGN_IDENTITY`):
  - **Con certificado**: firma para repartir (hardened runtime y los permisos de [scripts/entitlements.plist](scripts/entitlements.plist)). Si además le das un perfil de notarización, la manda a Apple, le pega la aprobación y vuelve a armar el zip; así abre en cualquier Mac sin avisos:

    ```bash
    # una sola vez: guarda en el llavero tu Apple ID, el Team ID y una contraseña de app (appleid.apple.com)
    xcrun notarytool store-credentials cfm-notary --apple-id <correo> --team-id <TEAM_ID>
    CFM_NOTARY_PROFILE=cfm-notary bun run build:release
    ```

  - **Sin certificado**: firma solo para este Mac. En otros Mac, la primera vez macOS dice que no pudo verificarla: *Ajustes del Sistema → Privacidad y seguridad → Abrir igualmente*.

**Windows (`cfm-windows.exe`)**

- **Abrirlo**: doble clic. Se abre una ventana que al terminar espera un Enter antes de cerrarse. Desde una terminal acepta los mismos comandos y flags que `cfm`.
- **Para mandarlo, comprímelo** (zip): pesa un tercio.
- **No está firmado**: la primera vez aparece "Windows protegió su PC". Elige **Más información → Ejecutar de todas formas**.
- El ícono y los datos del archivo (nombre, versión) solo se pueden poner compilando en Windows: bun no lo permite desde un Mac.
- En Windows 10 se abre la consola antigua: algunos símbolos de las tablas pueden verse como cuadritos.

## Uso

```bash
cfm              # menú: elige qué hacer
cfm <comando>    # directo a un comando
cfm --help       # comandos y opciones
cfm --version    # versión instalada
```

### Qué puedes hacer

| Comando | Qué hace | ¿Escribe? |
| --- | --- | --- |
| `migrate` | **Migrar entries** (padre + hijos) de un ambiente a otro | sí (draft) |
| `migrate-model` | **Migrar modelo**: crear content types y agregar campos que faltan, sin contenido | sí |
| `migrate-assets` | **Migrar imágenes y archivos** sueltos, sin entries | sí (draft) |
| `compare-models` | **Comparar modelos** entre ambientes, campo por campo | no |
| `compare-entry` | **Comparar entries** entre ambientes, valor por valor | no |
| `status` | **Estado de los ambientes**: content types, idiomas y tags que difieren | no |
| `history` | **Historial** de migraciones de tu cuenta, a partir de los respaldos | no (1 llamada: saber qué cuenta eres) |
| `restore` | **Deshacer** una migración con su respaldo | sí |
| `login` | **Iniciar sesión**: pegar o cambiar tu token de Contentful | no (guarda el token en tu equipo) |
| `logout` | **Cerrar sesión**: borrar el token guardado en tu equipo | no (lo quita de tu equipo) |

Sin comando, la herramienta muestra este menú. Los comandos que comparan pueden guardar un **reporte Markdown** para compartir (`--report archivo.md`, o te lo ofrece al final).

**Moverse entre preguntas**: **Esc** vuelve a la pregunta anterior (también hay una opción **← Volver** al final de cada lista) y **Ctrl+C** sale sin escribir nada. Se puede volver desde la confirmación final hasta el menú; las lecturas a Contentful quedan en memoria, así que volver no repite llamadas. Las preguntas que resolviste con flags se saltan al volver.

### Migrar entries

1. Elige el **space** (si tienes uno solo, se elige solo) y los ambientes **origen** y **destino**. Los ambientes salen en orden: desarrollo (`develop`) y pruebas (`qa`, `staging`…) primero y **producción al final** (`master` o el que tenga un alias), marcada como *producción*. Si eliges producción como **origen**, te pide confirmarlo: lo normal es migrar desde un ambiente de pruebas hacia producción.
2. Elige **cómo seleccionar las entries**. Cada opción indica cuánto consume de la API:

   | Forma | Llamadas a la API | Flag |
   | --- | --- | --- |
   | Por **entry ID o URL** (pegar, también desde Excel) | ninguna extra · la más directa | `--ids a,b` |
   | **Buscar por texto** | 1 por búsqueda | `--search "Ramon"` |
   | Por **content type** (y un texto opcional) | 1 | `--content-type banner` |
   | **Cambiadas recientemente** (opcional: solo las tuyas) | 1–2 | `--since 7d --mine` |
   | Por **tag** | 2 | `--tag navidad` |
   | Desde un **archivo** (txt o csv) | ninguna extra | `--ids-file lista.csv` |
   | Las que **faltan en destino** (por content type) | 1 por cada 200 entries + verificación | `--missing --content-type banner` |

   Las búsquedas muestran hasta 50 resultados (los más recientes) y eliges con checks; puedes escribir para filtrar.

   Al pegar IDs:
   - Acepta la **URL de la entry** tal como la copias del navegador (`https://app.contentful.com/spaces/…/entries/<entry id>`).
   - Uno por línea, o separados por coma, punto y coma, espacio o tabulación: puedes **pegar una columna o una fila de Excel**.
   - **Enter** agrega una línea. Para continuar, presiona **Tab** (va al botón `[ submit ]`) y luego **Enter**. Así, una celda vacía en lo que pegas no envía la respuesta antes de tiempo.
   - Si algo no tiene forma de entry ID (por ejemplo, la URL de un asset), te dice cuál y te deja pegar de nuevo. Si varios IDs no existen en origen, te los lista todos.
3. Revisa el árbol: la entry que pegaste (**padre**) y las entries a las que apunta (**hijos**).
   - El padre se crea si no existe en destino.
   - Un hijo que ya existe en destino **se reutiliza sin tocarlo**. Igual se muestra lo que tiene debajo y se revisa su modelo.
   - De lo que ya existe en destino, el árbol muestra **qué cambió en origen**: *"se actualiza · 2 campo(s): Título, CTA"*, *"ya existe · sin cambios"* o, en un hijo, *"ya existe · cambió en develop, no se migra"*. Solo cuenta lo que la migración **cambiaría de verdad**: arma la entry como quedaría en destino, con las mismas reglas con que se escribe, y la compara con la actual. No cuentan el orden de los idiomas o de las claves de un rich text, los idiomas que destino no tiene ni los campos con otro tipo (nunca se escriben). Un campo que falta en el modelo de destino sale como *(campo nuevo)*: si no lo agregas al modelo, esa entry no se actualiza. También cuenta si origen tiene tags que la entry no tiene en destino.
   - Si algo que ya existe cambió, te pregunta **qué actualizar** (o lo dice `--update all|none|id,id`): la primera opción es **actualizar todas**; también puedes **elegir cuáles** (padre por padre e hijo por hijo; las que elegiste vienen marcadas y los hijos no) o no actualizar ninguna. Lo que no actualices (o no tenga cambios) no se toca. Un hijo marcado se trata como un padre: si apunta a entries que no existen en destino, también se crean.
   - Un hijo que no existe en destino se crea, y se revisan sus propios hijos con la misma regla.
   - Un **texto enlazado** dentro de un rich text (`↗`) no es un hijo: no se migra. Si apunta a una entry que no existe en destino, te avisa que el enlace quedará roto.
   - Si una entry está **archivada** en destino, no se actualiza (y si es un hijo reutilizado, te avisa que el padre no se podrá publicar).
   - Si se van a escribir más de 20 entries, te pide confirmar que el árbol es lo que esperabas.
4. **Imágenes**: si faltan imágenes en destino, te pregunta si migrar con imágenes (o lo dicen `--assets` / `--no-assets`). Si dices que sí, reutiliza las que ya existen y crea las que faltan.
5. **Modelo**: compara el modelo de padres e hijos con el de destino (también la **apariencia del editor**: help text, widget y sus ajustes; la tabla dice exactamente qué difiere en cada campo, aunque las entries no tengan cambios) y te muestra:
   - campos que **faltan** en destino → eliges cuáles agregar (si no marcas nada, no se toca el modelo y esos campos no se migran);
   - campos que **sobran** en destino → no se tocan y conservan su valor;
   - campos con **otro tipo** → no se migran;
   - campos con el mismo tipo pero **reglas distintas** (`!`): otro nombre, obligatorio o localizado en un solo ambiente (si no está localizado en destino, solo se copia el locale por defecto), validaciones distintas (tipos de entry permitidos, tamaño, formato…), si se puede editar, si sale en la API o su valor por defecto;
   - **datos del content type** distintos: nombre, descripción o campo de título;
   - content types que **no existen** en destino → eliges si crearlos (si no, esas entries no se migran).

   Lo que elijas aquí también se puede decir con `--model all|none|<cambios>`.
6. Revisa el **resumen** y confirma. El resumen dice cuántas entries se crean, se actualizan y se reutilizan, qué imágenes y tags se crean, y lista **cada cambio de modelo** (content type, cambio y detalle). Debajo muestra el comando para **repetirlo sin preguntas**. También avisa qué entries quedarán con **campos obligatorios vacíos** en destino (no se podrán publicar hasta completarlos). Revisa el idioma por defecto y los idiomas que en destino no permiten campos vacíos. Si el destino parece producción (es `master` o tiene un alias), tienes que escribir el nombre del ambiente para confirmar.
7. Al terminar te dice dónde quedó el **respaldo** y otra vez el comando para **repetir** la migración.

### Migrar modelo, imágenes, comparar y estado

- **`migrate-model`**: muestra los content types de origen que difieren en destino —content types y campos que faltan, **reglas** de campos o la **apariencia del editor** (help text, widget)— y eliges qué aplicar: todo de una vez, cambio por cambio o nada (o `--model`). El resumen lista cada cambio antes de confirmar. Nunca borra campos ni cambia su ID o tipo. `--content-type a,b` para limitarlo.
- **`migrate-assets`**: elige archivos por ID/URL (`/assets/<id>`) o buscando por nombre (`--search`). Los que ya existen en destino se reutilizan. El resumen dice cuántos se crean y cuántos se reutilizan.
- **`compare-models`**: una tabla con todos los content types y su estado, el detalle campo por campo de los que difieren y qué campos tienen otra **apariencia del editor**. `--content-type a,b` para ver solo esos.
- **`compare-entry`**: elige entries igual que al migrar (ID, búsqueda, recientes, tag, archivo) y ve, campo por campo, qué valor tienen en cada ambiente.
- **`status`**: resumen de content types iguales, con diferencias, que faltan o que sobran, más idiomas y tags que faltan.
- **`history`**: las migraciones anteriores **de la cuenta con la que iniciaste sesión** (fecha, tipo, ambientes, qué se actualizó y creó, y su respaldo).

### Atajos con flags y "Repetir"

Cada comando muestra el comando **"Repetir"**: el mismo comando con flags para todo lo que elegiste (space, ambientes, entries y decisiones). En los que escriben aparece en el resumen, antes de confirmar, y al terminar; en los de lectura, al terminar. Cópialo para hacer lo mismo otra vez sin preguntas. Por ejemplo:

```bash
cfm migrate --space abc123 --from develop --to qa --ids 5NIY0nRGNkKvvjO8yc8Pp1 --update all --assets --model add:banner.subtitle,editor:imagen.alt
```

Todo lo que se pregunta se puede pasar por flags, para ir más rápido:

```bash
cfm migrate --space <space> --from develop --to qa --ids 5NIY0nRGNkKvvjO8yc8Pp1,otroId
cfm migrate --from develop --to qa --since 7d --mine        # lo que editaste esta semana
cfm migrate --from develop --to qa --missing --content-type banner
cfm compare-models --from develop --to qa --report modelos.md
cfm status --from develop --to qa
```

- `--from`/`--to` aceptan aliases como `master`.
- Con flags para elegir entries y sin comando, se asume `migrate`.
- Decisiones sin preguntar:
  - `--update all|none|id,id`: qué entries que ya existen en destino actualizar.
  - `--assets` / `--no-assets`: crear o no las imágenes que faltan.
  - `--model all|none|<cambios>`: qué cambios de modelo aplicar. Cada cambio es `create:<ct>`, `info:<ct>`, `add:<ct>.<campo>`, `rules:<ct>.<campo>` o `editor:<ct>.<campo>`; el "Repetir" los escribe por ti. Si algo ya no está pendiente (por ejemplo, ya se aplicó), te avisa y sigue con lo demás.
- La **confirmación final se pide siempre** (y en producción, escribiendo el nombre del ambiente).
- `cfm --help` lista cada flag y a qué comandos sirve.

### Ver cada llamada a la API: `--verbose`

```bash
cfm --verbose
```

Muestra cada llamada (método, ruta y parámetros; nunca headers ni token). Siempre, al terminar, dice cuántas llamadas se hicieron.

`cfm --help` muestra todas las opciones.

### Probar sin escribir: `--dry-run`

```bash
cfm --dry-run
```

Hace todo el análisis, muestra las tablas y el resumen, y se detiene ahí. No escribe nada en Contentful ni crea respaldo.

### Deshacer una migración: `restore`

```bash
cfm restore                 # elige el respaldo de una lista
cfm restore <respaldo.json> # o indica el archivo
cfm restore --dry-run       # muestra qué restauraría, sin escribir
```

Cada migración guarda un respaldo en `~/.ctf-migrate/backups/<cuenta>/` (en Windows, `C:\Users\<usuario>\.ctf-migrate\backups\<cuenta>\`): **una carpeta por cada cuenta de Contentful**, así si usas varias cuentas sus respaldos e historial no se mezclan. Antes de actualizar una entry que ya existía en destino, guarda cómo estaba; si no puede guardarlo, no la actualiza.

`restore` devuelve esas entries a como estaban:

- Si alguien editó o publicó la entry **después** de la migración, te avisa: restaurar también deshace esos cambios.
- Solo restaura respaldos de **la cuenta con la que iniciaste sesión**. Si el respaldo es de otra cuenta, te dice cuál y que inicies sesión con ella.
- Si la entry ya no existe en destino, la omite.
- Si durante la migración la actualización de una entry falló, no hay nada que deshacer: la omite.
- Lo que la migración **creó** (entries, imágenes, tags, content types, campos del modelo) **no se borra**, porque la herramienta nunca borra. Te lo lista para que decidas en Contentful.
- El restore también guarda su propio respaldo, así que se puede deshacer.

## Garantías

- Nunca publica entries ni assets.
- El modelo solo cambia con lo que elijas: **todo**, que siempre es la primera opción, o **cambio por cambio** (crear un content type, cambiar su nombre, descripción y campo de título, agregar un campo, llevar las reglas de un campo, copiar la apariencia de un campo). Nunca borra campos ni cambia su ID o tipo. El campo de título solo se cambia si ese campo existe en destino (o se agrega en la misma ejecución). Los cambios de estructura (content types, datos, campos, reglas) se publican, porque Contentful lo exige; la apariencia sola no publica nada.
- **Reglas de un campo** (nombre, obligatorio, localizado, validaciones, si se puede editar, si sale en la API y valor por defecto): se llevan las de origen. La opción avisa cuando puede afectar el contenido que ya existe: si el campo pasa a ser obligatorio, las entries con ese campo vacío no se podrán publicar; si deja de ser localizado, se pierden los valores de los otros idiomas, y si deja de salir en la API, el sitio no lo recibe. Cómo estaban queda en el respaldo; `restore` no las revierte.
- **Apariencia del editor** (help text, widget de cada campo): Contentful la guarda aparte del modelo. Se copia sola al crear un content type o agregar campos; la de campos que ya existen se ofrece en `migrate` y `migrate-model`, campo por campo. Un help text vacío, unos ajustes vacíos, un widget por defecto escrito en un ambiente y omitido en el otro, o los ajustes por defecto de un widget guardados al confirmar (por ejemplo, en una referencia, *Show "Create new entries": Yes*) cuentan como iguales. La tabla nombra el widget y cada ajuste como en la pantalla de Contentful: *widget «Entry cards» (en master: «Entry links») · Show "Create new entries": no (en master: sí)*. De un widget de app o extensión (que podría no estar instalada en destino) solo se copia el help text. No se revierte con `restore`, pero queda registrada en el respaldo.
- Si una entry ya existe en destino, se actualizan solo los campos que existen en ambos modelos con el mismo tipo. Los campos que solo existen en destino conservan su valor, igual que los idiomas que origen no trae: los que origen no tiene y las traducciones de un campo que en origen no está localizado.
- Si una entry ya existe y está publicada, queda como **Changed**: lo publicado sigue en vivo.
- Los tags que falten en destino se crean. Al actualizar una entry se le **agregan** los tags de origen; nunca se le quita uno que tenga en destino.
- Antes de actualizar una entry existente, guarda cómo estaba (ver `restore`).
- **Varias cuentas**: cada respaldo registra la cuenta (usuario, email y región) y se guarda en su carpeta. `history` y `restore` solo muestran los de la cuenta con la que iniciaste sesión; `restore` no deja restaurar el respaldo de otra cuenta. Los respaldos anteriores a la 0.6.0, que no registran cuenta, se muestran aparte.
- Justo antes de escribir vuelve a mirar destino: si algo del árbol apareció, desapareció o se archivó mientras revisabas, o si alguien editó una entry que se iba a actualizar, se detiene sin escribir.
- Si el árbol pasa de 300 entries, se detiene: seguramente un link está arrastrando una página entera. Los límites están en `src/config.ts` de `cmtool-core`.

## Seguridad

- **Un solo módulo escribe**: el writer de `cmtool-core` (`src/contentful/write.ts` del núcleo). Queda atado al ambiente destino y no tiene forma de borrar, archivar, despublicar ni escribir en origen; los tests del núcleo lo verifican sobre su código fuente. En este repo, [test/security.test.ts](test/security.test.ts) falla si el CLI llama por su cuenta un método del CMA que escribe.
- **El token solo va a Contentful**: se lee de `CONTENTFUL_MANAGEMENT_TOKEN` o de `~/.contentfulrc.json` y solo se envía a `api.contentful.com` o `api.eu.contentful.com`. Si el archivo de sesión apunta a otro host, la herramienta se detiene. Los mensajes de error nunca imprimen la request (que lleva el token). El token que pegas no se ve en pantalla, se prueba solo contra esos hosts y se guarda con permiso de lectura solo para tu usuario.
- **Las imágenes solo se copian desde el CDN de Contentful** (`*.ctfassets.net`, por https).
- **Nada se escribe antes de confirmar**: todo lo anterior al resumen es solo lectura.
- **El núcleo pone los mismos límites a cualquier herramienta**: su cliente (`createCma`) se niega a mandar el token a un host que no sea de Contentful, y su writer es el único que escribe. Una web o un backend que usen `cmtool-core` tienen las mismas garantías que `cfm`. [test/architecture.test.ts](test/architecture.test.ts) revisa que el CLI hable con Contentful solo a través del núcleo (no importa `contentful-management`) y que use solo sus entradas públicas.
- **Dependencias**: el paquete publicado solo instala `picocolors` (lo usa `bin/cfm.mjs`). El núcleo (con `contentful-management`) y `@clack/prompts` van dentro de `dist/cli.js`, por eso son dependencias de desarrollo. Para desarrollar, además: `typescript`, `@types/node`, `@biomejs/biome` y `esbuild`. Todas con versión exacta. Solo esbuild tiene script de instalación (descarga su binario). Por eso pnpm necesita `allowBuilds`, y `package.json` lo pone en `trustedDependencies` para bun: si falta, bun 1.4 lo agrega solo al instalar y el lint falla. Lo que se publica en npm (solo `bin/`, `dist/` y el CHANGELOG) lo revisa [test/app.test.ts](test/app.test.ts); ver [PUBLICAR.md](PUBLICAR.md).

## Cómo está organizado

Una regla: **toda la lógica está en el núcleo** (`cmtool-core`); el CLI solo pregunta, muestra y guarda archivos. Cada comando se lee de arriba abajo en [src/commands/](src/commands/).

```text
package.json         el paquete cmtool-cli: comandos (bin), scripts y dependencias
pnpm-workspace.yaml  solo para pnpm: deja correr la instalación de esbuild
tsconfig.json        revisa tipos (no genera archivos)
bin/
  cfm.mjs            comando del build: carga dist/cli.js (avisa si el build quedó viejo)
  cfm-dev.mjs        comando de desarrollo: corre src/ sin compilar (el núcleo, ya compilado)
  stale-build.mjs    compara las fechas del código (src/ y el núcleo instalado) con la del build
scripts/
  build.mjs          el build: empaqueta el CLI, el núcleo y sus dependencias con esbuild
  build-release.mjs  la app de Mac y el ejecutable de Windows (bun build --compile), firma y notarización
  entitlements.plist permisos de la app firmada con Developer ID
  render-icon.swift  assets/icon.svg → assets/icon.png
assets/              ícono de la app
dist/, release/      generados (no se suben): el build y las apps
src/
  cli.ts             arranque: corre main y traduce errores a mensajes y códigos de salida
  exe.ts             entrada de los ejecutables (la app de Mac se vuelve a abrir en tu terminal)
  main.ts            --version, --help, menú y despacho al comando
  cli-args.ts        ÚNICA definición de comandos y flags (de ahí salen el menú, la ayuda y la validación)
  app.ts             nombre del comando y versión (de package.json)
  session.ts         token y host (sesión del Contentful CLI o variable de entorno)
  errors.ts          CancelError y BackError (cancelar o volver en una pregunta)
  commands/          un archivo por comando, se lee de arriba abajo
    registry.ts      qué función corre cada comando
    context.ts       lo común: sesión, space y ambientes, lecturas una sola vez, confirmar, respaldar, cerrar
    migrate.ts, migrate-model.ts, migrate-assets.ts, compare-models.ts, compare-entry.ts,
    status.ts, history.ts, restore.ts
    login.ts         iniciar sesión (pedir y guardar el token) y cerrarla (logout)
  selection/         cómo se eligen entries (ID, búsqueda, recientes, tag, archivo, faltantes) y assets
  report/save.ts     dónde se guardan los reportes
  ui/                terminal: no decide ni escribe
    views/           tablas por tema: entries, assets, model, summary, entry-diff, status, history, restore
    prompts.ts       preguntas genéricas (choose, chooseMany, search, askText…) y específicas
    runner.ts        el runner del núcleo con barra de progreso y lista de ✔ / ✖
    table.ts, log.ts, header.ts, status.ts, api-calls.ts, navigation.ts
    browser.ts, pause.ts, relaunch.ts   navegador, pausa en Windows y la app de Mac
test/                tests del CLI: setup (sin red, HOME temporal), seguridad, arquitectura y uno por módulo
graphify-out/        el grafo del código, de antes de separar los repositorios
```

## Desarrollo

El código es TypeScript. `cfm-dev` lo ejecuta directo (Node quita los tipos al vuelo): editas un `.ts` de `src/` y lo corres. `cfm` usa el build, que se regenera con el script `build`.

Con tu gestor (`npm run …`, `pnpm …`, `yarn run …` o `bun run …`):

| Script | Qué hace |
| --- | --- |
| `typecheck` | revisa tipos con tsc (no genera archivos) |
| `lint` | lint + formato con Biome |
| `format` | aplica el formato y los arreglos automáticos de Biome |
| `test` | tests (`node:test`, sin dependencias extra) |
| `check` | typecheck + lint + tests; córrelo antes de hacer commit |
| `build` | empaqueta el CLI y el núcleo en `dist/cli.js` (lo que corre `cfm`) |
| `build:release` | genera la app de Mac y el ejecutable de Windows en `release/` (necesita bun instalado, con cualquier gestor; ver [Ejecutables](#ejecutables-para-mac-y-windows)) |
| `start` | corre el build desde la carpeta, sin el comando global |
| `dev` | corre el código fuente desde la carpeta, sin el comando global |

Por ejemplo: `npm run check`, `pnpm check` o `bun run check`. Los tests siempre corren con Node (`node --test`), también con bun.

**Cómo usa el CLI al núcleo.** El CLI importa `cmtool-core` como cualquier paquete de npm (`import { buildPlan } from 'cmtool-core'`), con versión exacta y como dependencia de desarrollo: el build lo mete dentro de `dist/cli.js`. tsc, los tests y `cfm-dev` usan su versión compilada (`dist/`) desde `node_modules`.

Para cambiar el núcleo y probarlo aquí sin publicarlo, **enlázalo** con bun:

```bash
cd ../cmtool-core && bun run build && bun link   # una vez: registra el núcleo en este equipo
cd ../cmtool-cli && bun link cmtool-core         # node_modules/cmtool-core apunta al repo del núcleo
```

`bun link cmtool-core` no cambia `package.json`: sigue pidiendo la versión de npm. Después de cada cambio en el núcleo corre `bun run build` en su repo: `cfm-dev` ya lo ve, y `cfm`, después de `bun run build` aquí (si se te olvida, avisa). Para volver a la versión de npm, `bun install --force`: `bun install` a secas deja el enlace. No uses `bun link --save`: escribe `link:cmtool-core` en `package.json`, que npm no entiende, y `bun run check` falla.

**Versiones.** Cada repositorio lleva la suya. Para subirla: `bun pm version 0.18.0 --no-git-tag-version` (o `npm version 0.18.0 --no-git-tag-version`), con su entrada en el [CHANGELOG](CHANGELOG.md). Si el CLI necesita algo nuevo del núcleo, primero se publica el núcleo y después se actualiza aquí: `bun add -d -E cmtool-core@<versión>`.

Los tests son **unitarios**: prueban la terminal y las utilidades del CLI, no hacen migraciones reales. Las reglas de la migración (qué se crea, qué se actualiza, el modelo, la escritura, el respaldo) se prueban en `cmtool-core`. [test/setup.ts](test/setup.ts) se carga antes de cada archivo de test y garantiza que:

- **No hay red**: cualquier conexión (http, https, fetch, sockets) falla, así que ningún test puede llegar a Contentful.
- **No se toca tu carpeta personal**: los tests ven una carpeta temporal como HOME (sin tu sesión, tu token ni tus respaldos) y escriben solo en carpetas temporales que se borran al terminar.

`isolation.test.ts` verifica que esa protección esté activa. Los tests cubren:

- **Argumentos y flags** (`cli-args.test.ts`, `app.test.ts`): comandos, a qué comandos sirve cada flag, `--version`, la ayuda generada, que el comando "Repetir" se vuelve a leer igual y que el núcleo se pide con versión exacta.
- **Navegación** (`navigation.test.ts`): volver al último paso que preguntó, saltando los resueltos por flags; flujos anidados; Esc vuelve y Ctrl+C sale.
- **Sesión** (`session.test.ts`, `login.test.ts`): el token solo va a hosts de Contentful; pegar, probar y guardar el token; cerrar sesión.
- **Errores** (`errors.test.ts`): cancelar y volver en una pregunta.
- **Resumen y reportes** (`summary.test.ts`, `report-save.test.ts`): la lista de cambios del modelo y dónde se guardan los reportes.
- **Windows y la app de Mac** (`pause.test.ts`, `relaunch.test.ts`): la pausa antes de cerrar la ventana y volver a abrirse en tu terminal.
- **Build viejo** (`stale-build.test.ts`): cuándo avisa `cfm` que el build es más viejo que el código o que el núcleo.
- **Código fuente** ([test/security.test.ts](test/security.test.ts)): el CLI no escribe en Contentful por su cuenta. [test/architecture.test.ts](test/architecture.test.ts): el CLI solo importa el núcleo, `@clack/prompts` y `picocolors`, y todo lo que importa está en `package.json`.

Reglas para que Node pueda ejecutar los `.ts` sin compilar:

- Los imports del código propio llevan la extensión `.ts` (`import { x } from './commands/context.ts'`). El núcleo, por su nombre de paquete: `import { buildPlan } from 'cmtool-core'`.
- Solo sintaxis que se puede borrar: nada de `enum`, `namespace` ni parámetros con `private`/`readonly` en el constructor. Para valores fijos usa un objeto `as const`, como `MARK` en [ui/table.ts](src/ui/table.ts#L4). `tsc` avisa si algo no cumple (`erasableSyntaxOnly`).
- Los tipos se importan con `import type`.

### Librerías de terminal

La interfaz usa **[@clack/prompts](https://bomb.sh/docs/clack/packages/prompts/)**: preguntas (selector con búsqueda, checks agrupados, texto de varias líneas, confirmaciones), spinners, barras de progreso y recuadros, todo sobre la misma línea vertical. Se evaluaron otras y se descartaron:

| Librería | Decisión | Por qué |
| --- | --- | --- |
| **@clack/prompts** | ✔ Se usa | Cubre todas las preguntas y los indicadores de progreso con un solo estilo; 4 dependencias pequeñas, sin scripts de instalación. |
| commander | ✖ | `parseArgs` de Node ya maneja los comandos y flags, con mensajes en español y tests. Commander sumaría una dependencia y mensajes en inglés sin mejorar la experiencia. |
| Ink | ✖ | React para la terminal, pensado para pantallas completas. Trae 20+ dependencias más React y usa JSX, que Node no ejecuta sin compilar (rompería `cfm-dev`). El flujo es un asistente paso a paso: lo que hace clack. |
| consola | ✖ | Sus logs duplican los de clack y sus prompts están hechos sobre clack: dos estilos para lo mismo. |
| listr2 | ✖ | Para árboles de tareas en paralelo. Las escrituras van una por una a propósito; la barra de progreso de clack lo cubre con el mismo estilo, y listr2 tomaría el control de la pantalla. |

Las tablas (árbol, imágenes, modelo, resumen) son propias ([src/ui/table.ts](src/ui/table.ts)) y se dibujan sobre la misma línea vertical de clack.

### Cómo extenderlo

Primero pregúntate de qué repositorio es: **si decide algo o habla con Contentful, va en el núcleo** (`cmtool-core`), y así lo tendrá también la web; si pregunta, muestra o guarda archivos, va aquí.

- **Nuevo comando**: agrégalo a `COMMANDS` (y sus flags a `FLAGS`) en [cli-args.ts](src/cli-args.ts), escribe su función en [commands/](src/commands/) usando [context.ts](src/commands/context.ts), y regístrala en [registry.ts](src/commands/registry.ts). El menú y la ayuda se actualizan solos; TypeScript avisa si falta registrarlo.
- **Nueva forma de elegir entries**: un método en [selection/entries.ts](src/selection/entries.ts); si es una búsqueda, el filtro va en `src/core/query.ts` del núcleo.
- **Cambiar qué se migra** (por ejemplo, que un hijo existente se actualice): `classifyTree` en `src/core/plan.ts` del núcleo.
- **Nuevo tipo de escritura**: un método en `src/contentful/write.ts` y su fase en `src/execute.ts`, en el núcleo.
- **Nueva tabla o columna**: [ui/views/](src/ui/views/); si también va al reporte, el texto en `src/text.ts` del núcleo.
- **Algo nuevo del núcleo**: se exporta allá, se publica una versión nueva del núcleo y aquí se actualiza la dependencia.
- **Cada cambio**: entrada en el [CHANGELOG](CHANGELOG.md) y la versión nueva, en cada repo que cambió.

## Licencia

[MIT](LICENSE) © 2026 Alejandro Dotor.

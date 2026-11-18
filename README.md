# cfm

Migra contenido de Contentful entre ambientes (por ejemplo, un banner de `develop` a `qa`) junto con todo lo que cuelga de él. **Todo queda en draft:** nunca publica entries ni imágenes, y nunca borra nada.

```bash
npm install -g cmtool-cli
cfm
```

`cfm` te pregunta paso a paso, te muestra qué va a pasar antes de escribir y guarda un respaldo para que puedas deshacerlo.

> El paquete de npm se llama `cmtool-cli` y el comando, `cfm`. Antes se llamaba `ctf-migrate`.

**Contenido:** [Instalar](#instalar) · [Iniciar sesión](#iniciar-sesión) · [Qué puedes hacer](#qué-puedes-hacer) · [Migrar entries, paso a paso](#migrar-entries-paso-a-paso) · [Los demás comandos](#los-demás-comandos) · [Ir más rápido: flags y "Repetir"](#ir-más-rápido-flags-y-repetir) · [Probar sin escribir](#probar-sin-escribir-y-ver-cada-llamada) · [Deshacer](#deshacer-una-migración) · [Qué garantiza](#qué-garantiza) · [App para Mac y Windows](#app-para-mac-y-ejecutable-para-windows) · [Si algo no funciona](#si-algo-no-funciona) · [Para programarlo](#para-programarlo)

## Instalar

Necesitas **Node 22.18 o superior** (recomendado: 24) y una cuenta de Contentful. Con el gestor que uses:

| | npm | pnpm | bun |
| --- | --- | --- | --- |
| **Instalar** | `npm install -g cmtool-cli` | `pnpm add -g cmtool-cli` | `bun add -g cmtool-cli` |
| **Actualizar** | `npm install -g cmtool-cli@latest` | `pnpm add -g cmtool-cli@latest` | `bun add -g cmtool-cli@latest` |
| **Quitar** | `npm rm -g cmtool-cli` | `pnpm rm -g cmtool-cli` | `bun rm -g cmtool-cli` |

Funciona igual en macOS y en Windows. En Windows, usa **Windows Terminal con PowerShell**: en el `cmd` antiguo algunos símbolos de las tablas (✔ ✖ ≠ ↗) se ven como cuadritos. Si PowerShell responde *"running scripts is disabled"*, corre una vez `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

¿Es para alguien que no va a instalar Node? Usa la [app para Mac o el ejecutable para Windows](#app-para-mac-y-ejecutable-para-windows).

## Iniciar sesión

La primera vez que abres `cfm`, si no encuentra tu sesión, te pregunta cómo entrar:

- **Crear un token y pegarlo:** abre Contentful en el navegador para que crees un token personal (*Create personal access token*). Lo copias y lo pegas.
- **Pegar un token que ya tienes.**
- **Usar el Contentful CLI:** termina y te pide correr `contentful login`.

El token no se ve en pantalla mientras lo pegas. `cfm` lo prueba con Contentful (y reconoce si es de la región EU) y lo guarda donde lo guarda `contentful login`: en `~/.contentfulrc.json` (en Windows, `C:\Users\<usuario>\.contentfulrc.json`), con permiso de lectura solo para tu usuario. Así `cfm` y el Contentful CLI comparten la sesión.

| Para | Comando |
| --- | --- |
| Cambiar el token (por ejemplo, si venció) | `cfm login` |
| Cerrar sesión: borra el token de tu equipo (también para el Contentful CLI) | `cfm logout` |
| Usar un token sin guardarlo, en macOS (tiene prioridad sobre el archivo) | `export CONTENTFUL_MANAGEMENT_TOKEN=<token>` |
| Lo mismo, en Windows (PowerShell) | `$env:CONTENTFUL_MANAGEMENT_TOKEN = "<token>"` |

`cfm logout` no revoca el token en Contentful. Si no lo vas a usar más, revócalo allá: *Account settings → CMA tokens*.

## Qué puedes hacer

```bash
cfm              # menú: elige qué hacer
cfm <comando>    # directo a un comando
cfm --help       # todos los comandos y opciones
cfm --version    # la versión instalada
```

| Comando | Qué hace | ¿Escribe? |
| --- | --- | --- |
| `migrate` | **Migrar entries** (cada una con sus hijos) de un ambiente a otro | sí, en draft |
| `migrate-model` | **Migrar modelo**: content types, campos, reglas y apariencia del editor, sin contenido | sí |
| `migrate-assets` | **Migrar imágenes y archivos** sueltos, sin entries | sí, en draft |
| `compare-models` | **Comparar modelos** entre ambientes, campo por campo | no |
| `compare-entry` | **Comparar entries** entre ambientes, valor por valor | no |
| `status` | **Estado de los ambientes**: content types, idiomas y tags que difieren | no |
| `history` | **Historial** de las migraciones de tu cuenta | no |
| `restore` | **Deshacer** una migración con su respaldo | sí |
| `login` / `logout` | Iniciar o cerrar sesión | solo en tu equipo |

**Para moverte entre preguntas:** **Esc** vuelve a la anterior (también está **← Volver** al final de cada lista) y **Ctrl+C** sale sin escribir nada. Puedes volver desde la confirmación final hasta el menú. Lo que ya se leyó de Contentful queda en memoria, así que volver no repite llamadas.

Los comandos que comparan pueden guardar un **reporte Markdown** para compartir: `--report archivo.md`, o te lo ofrecen al final.

## Migrar entries, paso a paso

**1. Space y ambientes.** Si tienes un solo space, se elige solo. Los ambientes salen ordenados: desarrollo y pruebas primero (`develop`, `qa`, `staging`…) y **producción al final** (`master`, o el que tenga un alias), marcada como *producción*. Si eliges producción como origen, te pide confirmarlo: lo normal es migrar hacia producción, no desde ella.

**2. Qué entries.** Cada forma dice cuánto consume de la API:

| Forma | Llamadas a la API | Flag |
| --- | --- | --- |
| Por **entry ID o URL** (pegados, también desde Excel) | ninguna extra | `--ids a,b` |
| **Buscar por texto** | 1 por búsqueda | `--search "Ramon"` |
| Por **content type** (y un texto opcional) | 1 | `--content-type banner` |
| **Cambiadas hace poco** (o solo las tuyas) | 1–2 | `--since 7d --mine` |
| Por **tag** | 2 | `--tag navidad` |
| Desde un **archivo** (txt o csv) | ninguna extra | `--ids-file lista.csv` |
| Las que **faltan en destino** (por content type) | 1 por cada 200 entries, más una verificación | `--missing --content-type banner` |

Al pegar IDs puedes pegar la **URL de la entry** tal como la copias del navegador, o **una columna o fila de Excel** (uno por línea, o separados por coma, punto y coma, espacio o tabulación). **Enter** agrega una línea; para seguir, **Tab** y luego **Enter**. Si algo no parece un entry ID, o no existe en origen, te dice cuál. Las búsquedas muestran hasta 50 resultados (los más recientes) y puedes escribir para filtrar.

**3. El árbol.** Ves la entry que elegiste (el **padre**) y las entries a las que apunta (sus **hijos**), con lo que pasará con cada una en destino:

| En destino, la entry… | Qué pasa |
| --- | --- |
| no existe | se crea, si es un padre o cuelga de algo que se escribe |
| existe y no cambió | no se toca |
| existe y cambió en origen | se puede **actualizar**: te pregunta cuáles (por defecto, los padres sí y los hijos no) |
| existe y es un hijo | se **reutiliza** sin tocarlo, salvo que lo marques para actualizar |
| está archivada | no se actualiza (y si es un hijo, te avisa que el padre no se podrá publicar) |

- **"Cambió" quiere decir que la migración la cambiaría de verdad.** `cfm` arma la entry como quedaría en destino y la compara con la actual: dice *"se actualiza · 2 campo(s): Título, CTA"*. No cuentan el orden de los idiomas, los idiomas que destino no tiene ni los campos con otro tipo, porque nunca se escriben. Un campo que falta en el modelo de destino sale como *(campo nuevo)*.
- **Un texto enlazado en un rich text** (`↗`) no es un hijo: no se migra. Si apunta a una entry que no existe en destino, te avisa que el enlace quedará roto.
- **Si se van a escribir más de 20 entries**, te pide confirmar que el árbol es lo que esperabas. Si pasa de 300, se detiene: seguramente un link está arrastrando una página entera.

**4. Imágenes.** Si faltan imágenes en destino, te pregunta si migrarlas (o `--assets` / `--no-assets`). Las que ya existen se reutilizan.

**5. Modelo.** Compara el modelo de lo que se escribe con el de destino, incluida la **apariencia del editor** (help text, widget y sus ajustes). Tú eliges qué llevar; si no marcas nada, el modelo no se toca:

- **campos que faltan** en destino: eliges cuáles agregar (los que no agregues no se migran);
- **campos que sobran** en destino: no se tocan y conservan su valor;
- **campos con otro tipo**: no se migran;
- **campos con otras reglas** (`!`): nombre, obligatorio, localizado, validaciones, si se puede editar, si sale en la API o el valor por defecto;
- **datos del content type**: nombre, descripción o campo de título;
- **content types que no existen** en destino: eliges si crearlos (si no, esas entries no se migran).

**6. Resumen y confirmación.** Dice cuántas entries se crean, se actualizan y se reutilizan, qué imágenes y tags se crean, y cada cambio de modelo. Avisa qué entries quedarán con **campos obligatorios vacíos** (no se podrán publicar hasta completarlos) y muestra el comando para [repetirlo sin preguntas](#ir-más-rápido-flags-y-repetir). Si el destino parece producción, tienes que escribir su nombre para confirmar.

**7. Al terminar,** te dice dónde quedó el **respaldo** y cómo deshacerlo.

## Los demás comandos

- **`migrate-model`**: lista lo que difiere en el modelo de destino (content types y campos que faltan, reglas de campos, apariencia del editor) y eliges qué aplicar: todo, cambio por cambio o nada. Nunca borra campos ni cambia su ID o tipo. `--content-type a,b` lo limita a esos.
- **`migrate-assets`**: elige archivos por ID o URL (`/assets/<id>`) o buscando por nombre (`--search`). Los que ya existen en destino se reutilizan.
- **`compare-models`**: todos los content types con su estado, el detalle campo por campo de los que difieren y qué campos tienen otra apariencia del editor.
- **`compare-entry`**: elige entries igual que al migrar y ve, campo por campo, qué valor tienen en cada ambiente.
- **`status`**: cuántos content types son iguales, difieren, faltan o sobran, y qué idiomas y tags faltan.
- **`history`**: las migraciones anteriores **de tu cuenta**: fecha, tipo, ambientes, qué se actualizó y se creó, y su respaldo.

## Ir más rápido: flags y "Repetir"

Al final de cada comando aparece **"Repetir"**: el mismo comando con flags para todo lo que elegiste. En los que escriben también aparece en el resumen, antes de confirmar. Cópialo para hacer lo mismo otra vez sin preguntas:

```bash
cfm migrate --space abc123 --from develop --to qa --ids 5NIY0nRGNkKvvjO8yc8Pp1 --update all --assets --model add:banner.subtitle
```

Todo lo que se pregunta se puede pasar por flags:

```bash
cfm migrate --from develop --to qa --ids 5NIY0nRGNkKvvjO8yc8Pp1,otroId
cfm migrate --from develop --to qa --since 7d --mine        # lo que editaste esta semana
cfm migrate --from develop --to qa --missing --content-type banner
cfm compare-models --from develop --to qa --report modelos.md
```

| Flag | Decide |
| --- | --- |
| `--update all\|none\|id,id` | qué entries que ya existen en destino se actualizan |
| `--assets` / `--no-assets` | si se crean las imágenes que faltan |
| `--model all\|none\|<cambios>` | qué cambios de modelo se aplican: `create:<ct>`, `info:<ct>`, `add:<ct>.<campo>`, `rules:<ct>.<campo>` o `editor:<ct>.<campo>` ("Repetir" los escribe por ti) |

`--from` y `--to` aceptan aliases como `master`. Si un cambio ya no está pendiente (por ejemplo, porque ya se aplicó), te avisa y sigue con lo demás. **La confirmación final se pide siempre.** `cfm --help` lista cada flag y a qué comandos sirve.

## Probar sin escribir y ver cada llamada

- **`--dry-run`** hace todo el análisis, muestra las tablas y el resumen, y se detiene ahí: no escribe nada en Contentful ni crea respaldo.
- **`--verbose`** muestra cada llamada a la API (método, ruta y parámetros; nunca headers ni el token). Siempre, al terminar, `cfm` dice cuántas llamadas hizo.

## Deshacer una migración

```bash
cfm restore                 # elige el respaldo de una lista
cfm restore <respaldo.json> # o indica el archivo
cfm restore --dry-run       # muestra qué restauraría, sin escribir
```

Antes de actualizar una entry que ya existía en destino, `cfm` guarda cómo estaba; si no puede guardarlo, no la actualiza. Los respaldos quedan en `~/.ctf-migrate/backups/<cuenta>/` (en Windows, `C:\Users\<usuario>\.ctf-migrate\backups\<cuenta>\`), una carpeta por cuenta de Contentful.

`restore` devuelve esas entries exactamente a como estaban:

- Si alguien la editó o publicó **después** de la migración, te avisa: restaurar también deshace eso.
- Si ya no existe en destino, o su actualización había fallado, la omite.
- Lo que la migración **creó** (entries, imágenes, tags, content types, campos) **no se borra**, porque la herramienta nunca borra: te lo lista para que decidas en Contentful.
- Solo restaura respaldos de **la cuenta con la que iniciaste sesión**.
- El restore también se respalda, así que también se puede deshacer.

## Qué garantiza

**Nunca:** publica entries ni imágenes, borra nada, ni escribe en el ambiente de origen. Todo lo anterior al resumen es solo lectura, y nada se escribe sin tu confirmación.

**Al actualizar una entry que ya existe:**

- Solo se escriben los campos que existen en los dos modelos con el mismo tipo. Los que solo existen en destino conservan su valor, igual que los idiomas que origen no trae.
- Si estaba publicada, queda como **Changed**: lo publicado sigue en vivo.
- Los tags de origen se **agregan**; nunca se quita uno que tenga en destino.
- Justo antes de escribir, `cfm` vuelve a mirar destino: si algo del árbol apareció, desapareció, se archivó o alguien lo editó mientras revisabas, se detiene sin escribir.

**El modelo solo cambia con lo que elijas,** todo o cambio por cambio. Nunca borra campos ni cambia su ID o tipo. Los cambios de estructura se publican, porque Contentful lo exige para usarlos; copiar solo la apariencia del editor no publica nada. Al llevar las **reglas** de un campo, la opción avisa si pueden afectar el contenido que ya existe (por ejemplo, si pasa a ser obligatorio). Cómo estaban las reglas y la apariencia queda en el respaldo, pero `restore` no las revierte.

**Tu token** solo va a Contentful (`api.contentful.com` o `api.eu.contentful.com`): si la sesión apunta a otro host, `cfm` se detiene. Los mensajes de error nunca lo muestran. Las imágenes solo se copian desde el CDN de Contentful (`*.ctfassets.net`, por https).

**Varias cuentas:** cada respaldo registra la cuenta (usuario, email y región). `history` y `restore` solo muestran los tuyos.

Estas reglas no dependen de `cfm`: están en el núcleo, [`cmtool-core`](https://www.npmjs.com/package/cmtool-core), y las verifican sus tests sobre el código fuente.

## App para Mac y ejecutable para Windows

Para quien no va a instalar Node: una app para Mac (`cfm.app`, macOS 13 o superior, Apple Silicon e Intel) y un ejecutable para Windows (`cfm-windows.exe`, Windows 10 y 11 de 64 bits). Se abren con doble clic, usan la misma sesión y los mismos respaldos que `cfm`, y desde una terminal aceptan los mismos comandos y flags. No están en npm: se reparten como archivo. Cómo se generan está en [DESARROLLO.md](DESARROLLO.md#ejecutables-para-mac-y-windows).

- **Mac:** descomprime `cfm-mac.zip` y arrastra `cfm.app` a *Aplicaciones*. Abre el menú en tu terminal (la que macOS usa para abrir ejecutables). Para actualizar, arrastra la nueva y elige **Reemplazar**: la sesión y los respaldos no se pierden. Si macOS dice que no pudo verificarla: *Ajustes del Sistema → Privacidad y seguridad → Abrir igualmente*.
- **Windows:** doble clic. Al terminar, la ventana espera un Enter antes de cerrarse. No está firmado: la primera vez aparece *"Windows protegió su PC"*; elige **Más información → Ejecutar de todas formas**. Para mandarlo, comprímelo en zip.

Cada uno muestra en el encabezado la versión con la que se generó.

## Si algo no funciona

| Qué pasa | Qué hacer |
| --- | --- |
| Error **401** | La sesión expiró o el token ya no sirve: pega uno nuevo con `cfm login`. |
| `cfm` no aparece después de instalar | La carpeta global de tu gestor no está en el PATH. Con pnpm, corre `pnpm setup` y abre otra terminal; con bun, revisa que `~/.bun/bin` esté en el PATH. |
| Corre una versión que no esperabas | Tienes dos instalaciones (por ejemplo, una con `bun link` y otra desde npm) y gana la primera del PATH. Quita una. |
| Lo instalaste antes de la 0.17.0 | El comando apunta al proyecto anterior: quítalo (`npm rm -g cfm`, `pnpm rm -g cfm`, o borra `~/.bun/bin/cfm`) y vuelve a instalarlo. |
| Tienes un comando `cfm-dev` | Quedó de la 0.17.0, que lo instalaba por error: quita `cmtool-cli` y vuelve a instalarlo. |

## Para programarlo

Este repositorio es **`cmtool-cli`**: el comando `cfm` y las apps. Toda la lógica (leer, comparar, planear, escribir y respaldar) está en el núcleo, [`cmtool-core`](https://www.npmjs.com/package/cmtool-core); aquí solo están las preguntas, las tablas y los archivos.

- [DESARROLLO.md](DESARROLLO.md): instalar desde el código, build, tests, cómo está organizado y cómo extenderlo.
- [PUBLICAR.md](PUBLICAR.md): cómo se publica una versión nueva.
- [CHANGELOG.md](CHANGELOG.md): qué cambió en cada versión.

## Licencia

[MIT](LICENSE) © 2026 Alejandro Dotor.

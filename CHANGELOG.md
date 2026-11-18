# Changelog

Cada cambio sube la versión: una funcionalidad nueva o un cambio de comportamiento sube la versión menor (0.3.0 → 0.4.0); una corrección, la de parche (0.4.0 → 0.4.1).

Desde la 0.18.0, `cmtool-cli` y `cmtool-core` llevan siempre la misma versión: `cfm` 0.18.0 lleva adentro el núcleo 0.18.0.

## 0.19.0 — 2026-11-18

### Cambiado

- Usa `cmtool-core` 0.19.0. La tabla de imágenes toma el nombre y el detalle de cada archivo del núcleo (`describeAsset`, `assetDetailText`), así el CLI y la web del dashboard muestran lo mismo. Un asset sin título en el idioma por defecto ahora muestra el de otro idioma antes que el nombre del archivo.

## 0.18.0 — 2026-11-18

### Cambiado

- **Usa la API nueva del núcleo** (`cmtool-core` 0.18.0): la conexión (`connect`) y las migraciones por etapas. Los comandos ya no encadenan funciones sueltas del núcleo: `migrate` importa 8 nombres del núcleo en vez de 28, y `migrate-model` 3 en vez de 16. El contexto de los comandos lleva el space de la conexión, que ya guarda lo que lee, en vez de memorizar cada lectura a mano.
- `restore` escribe a través del núcleo (`backupRestore`), como las demás migraciones. Cada entry restaurada se lista como "título · ID", igual que en las otras fases.
- `compare-models` usa la misma etapa de análisis que `migrate-model`.
- **El README es para quien usa `cfm`:** instalar, iniciar sesión, migrar, deshacer y qué garantiza, en ese orden, con una tabla de problemas comunes. Lo de programarlo (desde el código, build, tests, estructura y ejecutables) pasó a [DESARROLLO.md](DESARROLLO.md), que no va en el paquete.
- [app.test.ts](test/app.test.ts) revisa que el núcleo se pida con la misma versión que el CLI.

### Corregido

- El README todavía decía "cuando `cmtool-cli` esté publicado" y "mientras `cmtool-core` no esté en npm".

## 0.17.1 — 2026-11-17

### Corregido

- **El paquete de npm ya no instala `cfm-dev`.** Es solo para desarrollar: corre el código fuente, que no va en el paquete. Instalado desde npm no servía, solo avisaba. Ahora se corre con el script `dev` (`bun run dev`, desde la carpeta del repo), que está en [scripts/dev.mjs](scripts/dev.mjs) y no se publica. Instalado con `bun link` o `npm link` desde el repo, ahora también trae solo `cfm`. **Si instalaste la 0.17.0**, quítala y vuelve a instalarla para que `cfm-dev` desaparezca: `bun rm -g cmtool-cli && bun add -g cmtool-cli` (con npm, `npm rm -g cmtool-cli && npm install -g cmtool-cli`).
- [app.test.ts](test/app.test.ts) revisa que el paquete tenga un solo comando (`cfm`), y que `bin/`, que se publica entero, solo lleve lo que usa `cfm`.

## 0.17.0 — 2026-11-17

### Cambiado

- **El proyecto ahora son tres repositorios independientes.** Ninguno necesita la carpeta de otro para instalar, compilar ni correr sus tests:
  - **`cmtool-core`**: el núcleo, con toda la lógica (leer, comparar, planear, escribir y respaldar) y sin pantalla. Es un paquete de npm con su propio CHANGELOG.
  - **`cmtool-cli`** (este): el comando `cfm`, la app de Mac y el ejecutable de Windows. Usa el núcleo como cualquier dependencia de npm. El historial de git de `cfm` sigue aquí.
  - **`backoffice-b2c`**: el back office web (Next.js), por ahora solo el punto de partida.
- **`cfm` funciona igual.** El paquete ahora se llama `cmtool-cli` (antes `cfm`). Si ya lo tenías instalado, quítalo y vuelve a instalarlo desde este repo (ver el README).
- **Listo para publicar en npm** (`npm install -g cmtool-cli`): el paquete lleva `bin/` y el build (`dist/cli.js`, que se genera solo al empaquetar). Solo instala `picocolors`, porque el núcleo y `@clack/prompts` van dentro del build; por eso pasaron a ser dependencias de desarrollo. Es **público, con licencia MIT** ([LICENSE](LICENSE)); los pasos para publicarlo están en [PUBLICAR.md](PUBLICAR.md), y [app.test.ts](test/app.test.ts) cuida qué se sube.
- El núcleo se instala desde npm con su versión exacta (`cmtool-core` 0.17.0), como dependencia de desarrollo, así que cualquier gestor sirve. Para probar cambios del núcleo sin publicarlo, `bun link cmtool-core` enlaza su carpeta (README, *Build y desarrollo*). [app.test.ts](test/app.test.ts) falla si `package.json` lo pide enlazado (`link:`) o con un rango.
- `cfm-dev` corre el código fuente del CLI y el núcleo ya compilado, desde `node_modules`. Instalado desde npm, avisa que solo funciona desde el repositorio.
- `cfm` avisa que el build quedó viejo también cuando el núcleo instalado es más nuevo (por ejemplo, si lo recompilaste enlazado).
- Los reportes Markdown dicen "Generado el …" en vez de "Generado por cfm el …": ahora los arma el núcleo, que no sabe qué herramienta lo usa.
- Un conflicto de versión al escribir dice "vuelve a intentarlo" en vez de "vuelve a correr cfm".
- En la lista de lo escrito, el ID va separado con `·` en vez de en gris.

### Agregado

- **Se publica solo, con GitHub Actions**: [ci.yml](.github/workflows/ci.yml) revisa cada push y pull request, y [release.yml](.github/workflows/release.yml) publica en npm al subir una etiqueta `vX.Y.Z` (si coincide con la versión), con *provenance*. Repositorio: [github.com/alejandrodotor8/cmtool-cli](https://github.com/alejandrodotor8/cmtool-cli).
- `test/architecture.test.ts`: el CLI solo importa el núcleo, `@clack/prompts` y `picocolors` (habla con Contentful solo a través del núcleo), y todo lo que importa está en `package.json`.
- `test/security.test.ts` revisa que el CLI no llame por su cuenta ningún método del CMA que escribe: eso solo lo hace el writer del núcleo, que tiene sus propios tests.
- [PUBLICAR.md](PUBLICAR.md): cómo publicar `cmtool-cli` en npm, y cómo lo instala el equipo.
- yarn 1 probado y documentado (instalar, build, tests y scripts).

### Corregido

- El README decía que ninguna dependencia de desarrollo tiene script de instalación: esbuild sí lo tiene.
- Con bun 1.4 (el que instala GitHub Actions), `bun install` agregaba esbuild a `trustedDependencies` en `package.json`, en una sola línea, y el lint fallaba. Ahora `package.json` ya lo trae. No cambia lo que se instala: bun 1.3 ya confiaba en esbuild y corría su script.

## 0.16.1 — 2026-10-09

### Cambiado

- El script que genera la app de Mac y el ejecutable de Windows ahora se llama **`build:release`** (antes `build:exe`), por la carpeta que genera: `build` → `dist/` (el comando `cfm`) y `build:release` → `release/` (lo que se reparte).
- `build:release` funciona con cualquier gestor (`npm run`, `pnpm`, `yarn`, `bun run`): arranca con Node y usa bun solo para compilar. Si bun no está instalado, lo dice con un mensaje claro en vez de un error del sistema.

## 0.16.0 — 2026-10-09

### Agregado

- **`cfm.app` para Mac**, con ícono: se instala arrastrándola a *Aplicaciones* y se abre con doble clic, desde Launchpad o con Spotlight. Abre el menú en **tu terminal**: la que macOS usa para abrir ejecutables (Warp, iTerm…, o Terminal si no elegiste otra), sin pedir permisos. Para actualizarla, se reemplaza por la nueva; la sesión y los respaldos no se pierden. `build:exe` la genera en `release/` junto con `cfm-mac.zip` para repartirla, y reemplaza al ejecutable suelto `cfm-mac`.
- **Firma y notarización**: con un certificado *Developer ID Application* en el llavero, `build:exe` firma la app para repartirla (hardened runtime y los permisos que pide bun). Con `CFM_NOTARY_PROFILE`, además la notariza con Apple, para que abra en cualquier Mac sin avisos. Sin certificado, firma solo para este Mac, como antes.
- Ícono en `assets/` (SVG y PNG de 1024 px; `swift scripts/render-icon.swift` regenera el PNG).

## 0.15.0 — 2026-10-09

### Agregado

- Comando **`logout`** (también en el menú, *Cerrar sesión*): quita el token guardado en este equipo, como `contentful logout`, sin tocar lo demás del archivo. Pide confirmar y avisa que también cierra la sesión del Contentful CLI (comparten el archivo) y que el token sigue existiendo en Contentful hasta que lo revoques allá.

## 0.14.0 — 2026-10-09

### Agregado

- **Iniciar sesión sin el Contentful CLI**: si no encuentra tu sesión, la primera vez pregunta cómo entrar: crear un token en Contentful (abre el navegador) y pegarlo, pegar uno que ya tienes, o usar `contentful login`. El token no se ve al pegarlo, se prueba con Contentful (reconoce la región EU) y se guarda donde lo guarda `contentful login`, con el mismo formato y permiso de lectura solo para tu usuario. La siguiente vez ya no pregunta. Sirve igual en `cfm` y en los ejecutables.
- Comando **`login`** (también en el menú, *Iniciar sesión*): pegar un token nuevo, por ejemplo si el anterior venció.

### Cambiado

- Con un error 401, el mensaje dice cómo pegar un token nuevo (`cfm login`), además de `contentful login`.

## 0.13.0 — 2026-10-09

### Agregado

- **Ejecutables para Mac y Windows**, que no necesitan Node ni el proyecto: `bun run build:exe` genera en `release/` `cfm-mac` (Apple Silicon e Intel en un solo archivo, firmado para que macOS lo deje abrir) y `cfm-windows.exe`. Se abren con doble clic y aceptan los mismos comandos y flags que `cfm`.
- En Windows, al abrir el ejecutable con doble clic, espera un Enter antes de cerrar la ventana, para que se alcance a leer el resumen o el error.

### Cambiado

- El nombre y la versión se importan de `package.json` en vez de leerlo del disco, así quedan dentro del build y de los ejecutables.

### Corregido

- `check` fallaba desde que se subió el grafo: Biome revisaba los archivos generados de `graphify-out/`. Ahora los ignora.

## 0.12.1 — 2026-10-08

### Corregido

- **Apariencia del editor**: los ajustes por defecto de un widget que Contentful guarda al confirmar la apariencia (en una referencia: *Use bulk editing: No*, *Show "Create new entries": Yes*, *Show "Link existing entries": Yes*; también los de Boolean, Rating y Date picker) contaban como diferencia frente a un campo que nunca se tocó. Ahora cuentan como iguales.
- Si cambian el widget y también un ajuste (por ejemplo, *Entry cards* sin *Create new entries*), ahora se ven los dos; antes solo se veía el widget.
- La diferencia de ajustes dice cuál y con qué valor (*Show "Create new entries": no (en master: sí)*), y los widgets salen con el nombre que se ve en Contentful (*Entry cards*, no `entryCardsEditor`).

## 0.12.0 — 2026-10-08

### Cambiado

- **Arranque más rápido**: el build empaqueta el código y sus dependencias en un solo archivo (`dist/cli.js`, con esbuild). `cfm` abre ~20 archivos al arrancar en vez de ~440; en caliente pasa de ~170 ms a ~50 ms, y la primera ejecución (con el disco en frío) es la que más gana.
- **Conecta con Contentful mientras ves el menú**: trae tus spaces (y los ambientes, si ya se sabe el space; en `history` y `restore`, tu cuenta) en segundo plano. Al elegir, normalmente ya están listos. Con `--verbose` no lo hace.
- Una sola sesión por ejecución: si vuelves al menú y eliges otro comando, no se repiten las lecturas.
- Una lectura que falla (por ejemplo, sin red) ya no queda guardada: se vuelve a intentar.

### Agregado

- Dependencia de desarrollo `esbuild` (solo para el build; funciona con npm, pnpm y bun, en macOS y Windows).
- `pnpm-workspace.yaml`: solo para pnpm (npm y bun lo ignoran). Permite a esbuild correr su script de instalación; sin él, `pnpm install` termina con error en pnpm 11+.

## 0.11.0 — 2026-10-07

### Agregado

- **Volver atrás**: **Esc** vuelve a la pregunta anterior en cualquier pregunta (listas, casillas, textos, pegar IDs, confirmación) y cada lista tiene la opción **← Volver**. Se puede volver desde la confirmación final hasta el menú. Las preguntas resueltas con flags se saltan al volver y las lecturas a Contentful no se repiten. **Ctrl+C** sale.
- **Ambientes en orden**: desarrollo (`develop`) y pruebas (`qa`, `staging`…) primero y producción (`master` o el ambiente con alias) al final, marcada como *producción*.
- **Producción como origen**: si eliges producción como ambiente de origen, pide confirmarlo (lo normal es ir de pruebas a producción). Con `--from master` solo avisa.
- **"Repetir" en todos los comandos y con todas las decisiones**: el comando para hacer lo mismo sin preguntas aparece en el resumen antes de confirmar y al terminar (en los de lectura, al terminar). Antes solo `migrate` lo mostraba, y sin las decisiones.
- Flags de decisión: `--update all|none|<ids>`, `--assets` / `--no-assets` y `--model all|none|<cambios>`. La confirmación final se pide siempre.
- **Resumen antes de confirmar** en `migrate-model` (cada cambio: content type, cambio y detalle) y en `migrate-assets` (cuántos se crean y se reutilizan). En `migrate`, el resumen también lista cada cambio de modelo.

### Cambiado

- Si tu usuario tiene un solo space, se elige solo.

## 0.10.0 — 2026-10-07

### Agregado

- **Datos del content type**: se comparan el nombre, la descripción y el campo de título, y se pueden llevar a destino ("Datos de «Banner»"). El campo de título solo se cambia si ese campo existe en destino o se agrega en la misma ejecución.
- Las reglas de un campo también comparan y llevan si se puede editar (`disabled`), si sale en la API (`omitted`) y su valor por defecto. Avisa si el campo deja de salir en la API.
- Antes de escribir también se detiene si alguien editó en destino una entry que se iba a actualizar mientras revisabas el plan.
- Tests de la escritura de punta a punta: orden de las fases, lo que llega a Contentful y lo que queda en el respaldo.

### Corregido

- **Qué cambió en una entry** ahora es exactamente lo que se escribiría: arma la entry como quedaría en destino y la compara con la actual. Antes marcaba como cambio:
  - el mismo contenido con los idiomas o las claves de un rich text en otro orden;
  - un idioma que destino no tiene (no se puede escribir);
  - un campo con otro tipo en destino (nunca se escribe).
- **Se perdían traducciones**: al actualizar un campo que en origen no está localizado pero en destino sí, se borraban sus otros idiomas en destino. Ahora se conservan.
- **Se perdían tags**: al actualizar una entry se reemplazaban sus tags y se quitaban los que solo tenía en destino. Ahora se agregan los de origen y no se quita ninguno. Los tags nuevos también cuentan como cambio.
- Una entry que solo cambia en campos nuevos del modelo que no agregaste ya no se actualiza (no escribiría nada y quedaría como *Changed*); el resumen lo dice. En el árbol, esos campos salen como *(campo nuevo)*.
- Con idiomas por defecto distintos entre ambientes, el valor de un campo no localizado pasa al idioma por defecto de destino en vez de perderse.
- Las reglas del modelo y la apariencia tampoco cuentan el orden de las claves como diferencia.
- Un widget omitido en un ambiente ya no cuenta como distinto si el tipo de campo no tiene widget por defecto conocido.

## 0.9.0 — 2026-10-07

### Agregado

- **"Todo" siempre es la primera opción**: en los cambios de modelo y en qué entries actualizar, eliges *todo* de una vez, *elegir cuáles* (lista para marcar) o *nada*. Ya no hay que marcar uno por uno para aplicarlo todo.
- **Cambios de modelo uno por uno**: cada campo que falta, cada regla distinta y cada apariencia distinta es una opción aparte, agrupada por content type (marcar el content type marca todo lo suyo).
- **Llevar las reglas de un campo** (nombre, obligatorio, localizado, validaciones) a destino, en `migrate` y `migrate-model`. La opción dice qué cambia ("obligatorio: no → sí") y avisa si puede afectar contenido existente. Cómo estaban queda en el respaldo.

### Corregido

- La apariencia del editor marcaba como distintos campos que se ven iguales en Contentful: help text vacío, ajustes vacíos (`{}`) o el widget por defecto escrito en un ambiente y omitido en el otro. Ahora solo cuenta lo que cambia de verdad.
- La tabla del modelo dice exactamente qué difiere en la apariencia: "help text falta en master", "help text distinto (en master: «…»)", "widget dropdown (en master: singleLine)" o "ajustes del widget distintos".
- Copiar el help text desde un widget de app ya no cambia el widget de destino por el de por defecto.
- Las reglas se comparan en las dos direcciones (antes no se detectaba un campo obligatorio solo en origen ni localizado solo en destino) y también el nombre del campo.

## 0.8.2 — 2026-10-07

### Corregido

- El help text no se copiaba aunque la diferencia se mostraba: la opción "Copiar apariencia del editor" venía sin marcar y Enter sin marcar nada seguía sin avisar. Ahora viene marcada (espacio para desmarcarla) y, si no marcas nada, se avisa que el modelo no cambia.
- La tabla del modelo decía "al día" en content types y campos con otro help text o widget en destino. Ahora lo dice ahí mismo ("1 con otro help text o widget", "help text o widget distinto"), en `migrate`, `migrate-model`, `compare-models` y el reporte, en vez de un aviso aparte.
- El resumen decía "se publica el modelo" cuando solo se copiaba la apariencia del editor, que no publica nada.

## 0.8.1 — 2026-10-07

### Corregido

- `migrate` no revisaba la apariencia del editor (help text, widget): solo lo hacía `migrate-model`. Ahora la compara para los content types del árbol, la avisa y ofrece "Copiar apariencia del editor" en la pregunta del modelo.
- Si las entries no tenían cambios, `migrate` terminaba antes de la pregunta del modelo, sin poder copiar un help text o agregar campos. Ahora sigue y solo termina si tampoco hay cambios de modelo marcados.

## 0.8.0 — 2026-10-07

### Agregado

- **Qué cambió en lo que ya existe**: el árbol de `migrate` compara cada entry que ya existe en destino con origen (sin llamadas extra) y muestra los campos que cambiarían: "se actualiza · 2 campo(s): Título, CTA", "ya existe · sin cambios" o, en un hijo, "ya existe · cambió en develop, no se migra".
- **Pregunta qué actualizar**, padre por padre e hijo por hijo: las entries elegidas vienen marcadas y los hijos no. Un hijo marcado se actualiza y, si apunta a entries que faltan en destino, también se crean.

### Cambiado

- Lo que ya existe y no cambió no se actualiza (antes se volvía a guardar igual, subía la versión y quedaba como *Changed*).
- El análisis de `migrate` va en dos etapas: primero el árbol y lo que cambió; después, según lo que decidas actualizar, el modelo, las imágenes y los tags.
- Si no hay nada que crear ni actualizar, termina con un mensaje en vez de un error.

## 0.7.0 — 2026-10-07

### Agregado

- **Apariencia del editor** (help text, widget y ajustes de cada campo), que Contentful guarda aparte del modelo y antes se perdía:
  - Se copia sola al crear un content type o agregar campos (en `migrate` y `migrate-model`).
  - `migrate-model` detecta campos que ya existen con otra apariencia y ofrece "Copiar apariencia del editor": sirve para arreglar content types ya migrados (por ejemplo, un help text que no llegó).
  - `compare-models` muestra qué campos tienen otra apariencia, también en el reporte.
  - De un widget de app o extensión solo se copia el help text, para no romper el editor si la app no está instalada en destino.
  - Queda registrada en el respaldo (no se revierte con `restore`).

## 0.6.1 — 2026-10-07

### Corregido

- La pregunta del modelo decía "¿Qué agrego al modelo de master?" aunque el content type no existiera en destino. Ahora distingue: "Este content type no existe en master: ¿lo creo?", "¿Qué campos agrego…?" o "¿Qué creo o agrego…?". En la lista, los content types nuevos dicen "nuevo: no existe en …" y la opción "Crear «Nombre» con sus N campos".

## 0.6.0 — 2026-10-07

### Agregado

- **Varias cuentas de Contentful en la misma máquina**: cada respaldo registra la cuenta (usuario, email y región) y se guarda en `~/.ctf-migrate/backups/<cuenta>/`. `history` y `restore` solo muestran los de la cuenta con la que iniciaste sesión, y `restore` no deja restaurar un respaldo de otra cuenta (te dice cuál es y que inicies sesión con ella).
- Los respaldos anteriores, que no registran cuenta, se siguen viendo, aparte y con aviso.

### Cambiado

- `history` hace 1 llamada a la API (para saber qué cuenta eres) y acepta `--verbose`.
- La cuenta se consulta una sola vez por ejecución; "solo las que editaste tú" la reutiliza.

## 0.5.0 — 2026-10-07

### Cambiado

- **El comando ahora se llama `cfm`** (antes `ctf-migrate`), y el de desarrollo `cfm-dev`. Hay que volver a instalar los comandos (ver README → "La herramienta").
- El nombre del comando se toma de `package.json` en todos los mensajes (ayuda, "Repetir", "Deshacer", reportes), así un próximo cambio de nombre se hace en un solo lugar.
- Los respaldos siguen en `~/.ctf-migrate/backups/`, para no perder los que ya existen.

## 0.4.0 — 2026-10-07

### Agregado

- **Menú inicial** ("¿Qué quieres hacer?") y **comandos** para cada acción: `migrate`, `migrate-model`, `migrate-assets`, `compare-models`, `compare-entry`, `status`, `history` y `restore`.
- **Formas de elegir entries** (en `migrate` y `compare-entry`), cada una con su consumo de API a la vista: por ID/URL, buscar por texto, por content type, cambiadas recientemente (opcional: solo las tuyas), por tag, desde un archivo y las que faltan en destino. Las búsquedas son una sola llamada (hasta 50 resultados, los más recientes).
- **`migrate-model`**: crear content types y agregar campos que faltan en destino, sin contenido.
- **`migrate-assets`**: copiar imágenes y archivos sueltos, por ID/URL o buscando por nombre.
- **`compare-models`**: todos (o algunos) content types comparados, con detalle campo por campo.
- **`compare-entry`**: una o varias entries comparadas valor por valor entre ambientes.
- **`status`**: resumen de content types, idiomas y tags que difieren entre dos ambientes.
- **`history`**: migraciones anteriores a partir de los respaldos, sin llamadas a la API.
- **Reportes Markdown** para comparar modelos, entries y estado (`--report archivo.md`, o se ofrece al final).
- Flags nuevos: `--ids-file`, `--search`, `--content-type`, `--tag`, `--since` (`hoy`, `7d`, `AAAA-MM-DD`), `--mine`, `--missing`, `--report` y **`--version` / `-v`**. La ayuda (`--help`) se genera de la misma definición que el menú y la validación, y dice a qué comandos sirve cada flag.

### Cambiado

- El comando para repetir una migración ahora es `ctf-migrate migrate …`. Con flags para elegir entries y sin comando, se sigue asumiendo `migrate`.
- Código reorganizado sin duplicar: una sola definición de comandos y flags, un contexto compartido por todos los comandos (sesión, ambientes, lecturas que se hacen una sola vez, confirmar, respaldar, cerrar), escritura por fases reutilizables y vistas separadas por tema.

## 0.3.0 — 2026-10-07

### Agregado

- **Dos comandos**: `ctf-migrate` corre el build (`dist/`, se genera con el script `build`) y `ctf-migrate-dev` corre el código fuente sin compilar. `ctf-migrate` avisa si el código es más nuevo que el build. `dist/` no se sube al repo.
- **Pegar entry IDs desde Excel**: la pregunta acepta varias líneas (columna o fila de Excel), coma, punto y coma, espacio y tabulación, y quita comillas. Valida que cada valor sea un entry ID o la URL de una entry, y si varias no existen en origen las lista todas.
- **Cualquier gestor de paquetes**: npm, pnpm o bun. El README muestra cómo instalar, correr y quitar el comando con cada uno, y cómo cambiar de gestor.
- **Instalación por sistema operativo** en el README: macOS y Windows (PowerShell, permisos de scripts, terminal recomendada, token por sistema) y cómo pasarle el proyecto a otra persona.
- **Tests aislados**: antes de cada archivo de test se bloquea la red y se usa una carpeta personal temporal, así ningún test puede llegar a Contentful ni ver tu sesión o tus respaldos.

### Cambiado

- **Interfaz con @clack/prompts** (reemplaza a @inquirer/prompts): selector de space con búsqueda, checks del modelo agrupados por content type, spinners mientras se consulta la API, barra de progreso por fase al escribir y recuadros de cierre con links, respaldo y comandos para repetir o deshacer. La pregunta de entry IDs muestra siempre cómo continuar (Tab + Enter). Se evaluaron commander, Ink, consola y listr2 y se descartaron (ver README).
- El aviso de **obligatorios vacíos** revisa también los idiomas que en destino no permiten campos vacíos, e indica en cuáles falta.
- **No se suben lockfiles** ni hay `packageManager`; las dependencias directas tienen versión exacta.

### Corregido

- `restore` mostraba como "editada después" una entry cuya actualización había fallado durante la migración. Ahora el respaldo marca cuáles sí se actualizaron y `restore` omite las demás.

## 0.2.0 — 2026-10-05

### Agregado

- **Padre e hijos**: se migra la entry que pegas y las entries que la componen. Un hijo que ya existe en destino se reutiliza sin tocarlo; solo se crean los que faltan.
- **Tablas en la terminal**: árbol de entries, imágenes, modelo campo por campo (con columnas por ambiente) y resumen.
- **Comparación de modelo**: campos que faltan, sobran, tienen otro tipo o reglas distintas (obligatorio, localizado, validaciones). Eliges con checks qué agregar.
- **Aviso de publicación**: el resumen dice qué entries quedarán con obligatorios vacíos o con textos enlazados a entries que no existen en destino.
- **Respaldo y `ctf-migrate restore`**: cada migración guarda cómo estaban las entries que actualiza, y `restore` las devuelve a ese estado.
- **`--dry-run`**, **`--verbose`** y flags para no pasar por los menús (`--space`, `--from`, `--to`, `--ids`).
- **Límites**: se detiene si el árbol pasa de 300 entries y pide confirmación si se van a escribir más de 20.
- **Entries archivadas** en destino: no se actualizan y se avisa.
- **Cambios durante la revisión**: justo antes de escribir se vuelve a mirar destino; si algo cambió, se detiene sin escribir.
- Tests, TypeScript y Biome (scripts `test`, `typecheck`, `lint`, `check`).

### Cambiado

- Un **texto enlazado** en un rich text ya no se considera hijo: no se migra.
- Código dividido por capas (`src/`), en TypeScript que Node ejecuta sin compilar. Requiere Node 22.18 o superior.
- Menos llamadas a la API: content types en 2 llamadas y entries por nivel, en lotes.

### Corregido

- Al actualizar una entry existente, los campos que **solo existen en destino se vaciaban**. Ahora se conservan.
- Un tag que no existe en origen ya no intenta crearse.

### Seguridad

- El token solo se envía a `api.contentful.com` o `api.eu.contentful.com` (antes, un host como `constructor` en el archivo de sesión pasaba el chequeo).
- Un solo módulo escribe en Contentful, atado al ambiente destino; nunca borra, archiva ni despublica. Lo verifica un test sobre el código.
- Si el destino es `master` o tiene alias, hay que escribir su nombre para confirmar.
- Las imágenes solo se copian desde el CDN de Contentful.
- Los errores y `--verbose` nunca muestran el token. Los respaldos solo los puede leer tu usuario.

## 0.1.0

- Primera versión: migra entries entre ambientes de forma interactiva, dejándolas en draft.

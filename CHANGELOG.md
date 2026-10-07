# Changelog

Cada cambio sube la versión: una funcionalidad nueva o un cambio de comportamiento sube la versión menor (0.3.0 → 0.4.0); una corrección, la de parche (0.4.0 → 0.4.1).

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

# Changelog

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
- Tests (`npm test`), TypeScript (`npm run typecheck`) y Biome (`npm run lint`).

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

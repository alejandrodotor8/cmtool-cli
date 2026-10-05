# ctf-migrate

Migra entries de Contentful entre ambientes (por ejemplo, un banner de `develop` a `qa`), junto con sus hijos. **Todo queda en draft.**

## Requisitos

- Node 22.18+ (corre TypeScript directo, sin compilar). Con fnm, `.node-version` elige Node 24.
- Una sesión de Contentful (ver abajo)

## Instalación (una sola vez)

1. Instala el Contentful CLI e inicia sesión. Se abre el navegador para autorizar y la sesión queda guardada en `~/.contentfulrc.json`:

   ```bash
   npm install -g contentful-cli
   contentful login
   ```

2. Instala la herramienta desde esta carpeta:

   ```bash
   npm install
   npm link        # deja disponible el comando `ctf-migrate` globalmente
   ```

> **Sin el CLI:** también puedes crear un token en Contentful (*Settings → CMA tokens*) y exportarlo antes de correr: `export CONTENTFUL_MANAGEMENT_TOKEN=<token>`.
>
> **Si usas fnm o nvm:** `npm link` queda atado a la versión de Node activa. Si cambias de versión, repite `npm link`.
>
> **Si sale un error 401:** la sesión expiró. Vuelve a correr `contentful login`.

## Uso

```bash
ctf-migrate
```

1. Elige el **space**.
2. Elige el ambiente **origen** y el **destino**.
3. Pega uno o varios **entry IDs** (también acepta URLs de Contentful).
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
7. Revisa el **resumen** y confirma. El resumen avisa qué entries quedarán con **campos obligatorios vacíos** en destino (no se podrán publicar hasta completarlos). Si el destino parece producción (es `master` o tiene un alias), tienes que escribir el nombre del ambiente para confirmar.
8. Al terminar te dice dónde quedó el **respaldo** de la migración.

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

- **Un solo módulo escribe**: [src/contentful/write.ts](src/contentful/write.ts). Queda atado al ambiente destino y no tiene forma de borrar, archivar, despublicar ni escribir en origen. Para verificarlo:
  `grep -rnE "\.(createWithId|update|publish|delete|archive|unpublish)\(" src` solo debe mostrar ese archivo.
- **El token solo va a Contentful**: se lee de `CONTENTFUL_MANAGEMENT_TOKEN` o de `~/.contentfulrc.json` y solo se envía a `api.contentful.com` o `api.eu.contentful.com`. Si el archivo de sesión apunta a otro host, la herramienta se detiene. Los mensajes de error nunca imprimen la request (que lleva el token).
- **Las imágenes solo se copian desde el CDN de Contentful** (`*.ctfassets.net`, por https).
- **Nada se escribe antes de confirmar**: todo lo anterior al resumen es solo lectura.
- **Dependencias**: solo 3 para correr (`contentful-management`, `@inquirer/prompts`, `picocolors`) y 3 de desarrollo con versión exacta (`typescript`, `@types/node`, `@biomejs/biome`). Ninguna tiene scripts de instalación. El paquete es `private` para que no se publique en npm por error.

## Cómo está organizado

Cada comando se lee de arriba abajo en [src/commands/](src/commands/). El código está separado por responsabilidad: lo que lee, lo que decide, lo que muestra y lo que escribe.

```text
index.mjs                entrada del comando (JS, para que `npm link` no cambie)
src/
  main.ts                lee los argumentos y corre el comando
  cli-args.ts            argumentos (--dry-run, restore, --help)
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
    client.ts            cliente del CMA
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
  ui/                    terminal: no decide ni escribe
    views.ts             tablas de entries, imágenes, modelo y resumen
    prompts.ts           preguntas al usuario
    table.ts             dibujo de tablas
    log.ts               mensajes de estado
    runner.ts            ejecuta escrituras una por una (✔ / ✖)
```

## Desarrollo

El código es TypeScript. Node lo ejecuta quitando los tipos, así que **no hay paso de compilación**: editas un `.ts` y corres `ctf-migrate`.

```bash
npm run typecheck   # revisa tipos con tsc (no genera archivos)
npm run lint        # lint + formato con Biome
npm run format      # aplica el formato y los arreglos automáticos de Biome
npm test            # tests (node:test, sin dependencias extra)
npm run check       # typecheck + lint + tests; córrelo antes de hacer commit
```

Los tests viven en `test/` y no llaman a Contentful: usan objetos armados a mano (`test/fixtures.ts`) y un CMA falso que registra cada llamada. Cubren:

- **Reglas de migración** (`plan.test.ts`): qué se crea, actualiza, reutiliza o no se crea; qué se ofrece agregar al modelo; el plan final.
- **Transformación de valores** (`fields.test.ts`): locales, merge con la entry existente y assets.
- **Modelo, links e IDs** (`model.test.ts`, `entries.test.ts`, `ids.test.ts`).
- **Seguridad**: el writer solo escribe en destino y solo publica content types (`write.test.ts`); el token solo va a hosts de Contentful (`session.test.ts`); los errores no muestran el token (`errors.test.ts`); los archivos solo se copian desde el CDN de Contentful (`fields.test.ts`).
- **Lectura del árbol** (`read.test.ts`): por niveles, links rotos y ciclos.
- **Respaldo y restore** (`backup.test.ts`, `restore.test.ts`, `write.test.ts`): el respaldo se guarda antes de actualizar y, si falla, no se actualiza; detecta cambios posteriores a la migración.
- **Argumentos** (`cli-args.test.ts`).
- **Comportamiento** (`entries.test.ts`, `read.test.ts`, `plan.test.ts`, `errors.test.ts`): textos enlazados que no son hijos, límite del árbol, entries archivadas, cambios en destino durante la revisión y conflictos de versión.
- **Reglas del modelo y publicación** (`model.test.ts`, `publish-check.test.ts`): obligatorio, localizado y validaciones; qué entries quedan con obligatorios vacíos; los campos que solo existen en destino no se tocan.

Reglas para que Node pueda ejecutar los `.ts` sin compilar:

- Los imports llevan la extensión `.ts` (`import { x } from './core/plan.ts'`).
- Solo sintaxis que se puede borrar: nada de `enum`, `namespace` ni parámetros con `private`/`readonly` en el constructor. Para valores fijos usa un objeto `as const`, como `ACTION` en [src/core/plan.ts](src/core/plan.ts). `tsc` avisa si algo no cumple (`erasableSyntaxOnly`).
- Los tipos se importan con `import type`.

### Cómo extenderlo

- **Cambiar qué se migra** (por ejemplo, que un hijo existente se actualice): `classifyTree` en [src/core/plan.ts](src/core/plan.ts).
- **Nueva pregunta al usuario**: una función en [src/ui/prompts.ts](src/ui/prompts.ts), su respuesta va a `buildPlan`.
- **Nuevo tipo de escritura** (por ejemplo, copiar locales): un método en [src/contentful/write.ts](src/contentful/write.ts) y su paso en [src/execute.ts](src/execute.ts).
- **Nueva tabla o columna**: [src/ui/views.ts](src/ui/views.ts).

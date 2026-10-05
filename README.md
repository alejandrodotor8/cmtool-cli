# ctf-migrate

Migra entries de Contentful entre ambientes (por ejemplo, un banner de `develop` a `qa`), junto con sus hijos. **Todo queda en draft.**

## Requisitos

- Node 20+
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
5. **Imágenes**: si faltan imágenes en destino, te pregunta si migrar con imágenes. Si dices que sí, reutiliza las que ya existen y crea las que faltan.
6. **Modelo**: compara el modelo de padres e hijos con el de destino y te muestra:
   - campos que **faltan** en destino → eliges cuáles agregar (si no marcas nada, no se toca el modelo y esos campos no se migran);
   - campos que **sobran** en destino → no se tocan y conservan su valor;
   - campos con **otro tipo** → no se migran;
   - content types que **no existen** en destino → eliges si crearlos (si no, esas entries no se migran).
7. Revisa el **resumen** y confirma. Si el destino parece producción (es `master` o tiene un alias), tienes que escribir el nombre del ambiente para confirmar.

## Garantías

- Nunca publica entries ni assets.
- El modelo solo cambia si marcas campos o content types para agregar. Nunca borra ni modifica campos existentes. Lo que agregues sí se publica, porque Contentful lo exige para poder usar esos campos.
- Si una entry ya existe en destino, se actualizan solo los campos que existen en ambos modelos con el mismo tipo. Los campos que solo existen en destino conservan su valor.
- Si una entry ya existe y está publicada, queda como **Changed**: lo publicado sigue en vivo.
- Los tags que falten en destino se crean.

## Seguridad

- **Un solo módulo escribe**: [src/contentful/write.mjs](src/contentful/write.mjs). Queda atado al ambiente destino y no tiene forma de borrar, archivar, despublicar ni escribir en origen. Para verificarlo:
  `grep -rnE "\.(createWithId|update|publish|delete|archive|unpublish)\(" src` solo debe mostrar ese archivo.
- **El token solo va a Contentful**: se lee de `CONTENTFUL_MANAGEMENT_TOKEN` o de `~/.contentfulrc.json` y solo se envía a `api.contentful.com` o `api.eu.contentful.com`. Si el archivo de sesión apunta a otro host, la herramienta se detiene. Los mensajes de error nunca imprimen la request (que lleva el token).
- **Las imágenes solo se copian desde el CDN de Contentful** (`*.ctfassets.net`, por https).
- **Nada se escribe antes de confirmar**: todo lo anterior al resumen es solo lectura.
- **Dependencias**: solo 3 directas (`contentful-management`, `@inquirer/prompts`, `picocolors`), sin scripts de instalación. El paquete es `private` para que no se publique en npm por error.

## Cómo está organizado

El flujo se lee de arriba abajo en [src/main.mjs](src/main.mjs). El código está separado por responsabilidad: lo que lee, lo que decide, lo que muestra y lo que escribe.

```text
index.mjs                 entrada del comando: corre main() y maneja errores/salida
src/
  main.mjs                el flujo completo, paso a paso
  session.mjs             token y host (sesión del CLI o variable de entorno)
  errors.mjs              AbortError y formato de errores del CMA
  analyze.mjs             paso de análisis: arma todo lo que se muestra (solo lectura)
  execute.mjs             paso final: aplica el plan con el writer
  contentful/
    client.mjs            cliente del CMA
    read.mjs              lecturas (árbol de entries, modelos, locales, assets, tags)
    write.mjs             ÚNICO módulo que escribe en Contentful
  core/                   reglas puras: sin red, sin terminal
    plan.mjs              qué se crea, actualiza, reutiliza; plan de escritura
    model.mjs             comparación de content types campo por campo
    fields.mjs            valores de origen → formato de destino (locales, merge, assets)
    entries.mjs           links, hijos, imágenes y título de una entry
    ids.mjs               parseo de IDs/URLs pegados
  ui/                     terminal: no decide ni escribe
    views.mjs             tablas de entries, imágenes, modelo y resumen
    prompts.mjs           preguntas al usuario
    table.mjs             dibujo de tablas
    log.mjs               mensajes de estado
```

### Cómo extenderlo

- **Cambiar qué se migra** (por ejemplo, que un hijo existente se actualice): `classifyTree` en [src/core/plan.mjs](src/core/plan.mjs).
- **Nueva pregunta al usuario**: una función en [src/ui/prompts.mjs](src/ui/prompts.mjs), su respuesta va a `buildPlan`.
- **Nuevo tipo de escritura** (por ejemplo, copiar locales): un método en [src/contentful/write.mjs](src/contentful/write.mjs) y su paso en [src/execute.mjs](src/execute.mjs).
- **Nueva tabla o columna**: [src/ui/views.mjs](src/ui/views.mjs).

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
7. Revisa el **resumen** y confirma.

## Garantías

- Nunca publica entries ni assets.
- El modelo solo cambia si marcas campos o content types para agregar. Nunca borra ni modifica campos existentes. Lo que agregues sí se publica, porque Contentful lo exige para poder usar esos campos.
- Si una entry ya existe en destino, se actualizan solo los campos que existen en ambos modelos con el mismo tipo. Los campos que solo existen en destino conservan su valor.
- Si una entry ya existe y está publicada, queda como **Changed**: lo publicado sigue en vivo.
- Los tags que falten en destino se crean.

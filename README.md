# ctf-migrate

Migra entries de Contentful entre ambientes (por ejemplo, un banner de `develop` a `qa`), junto con sus hijos. **Todo queda en draft.**

## Requisitos

- Node 20+
- Contentful CLI con sesión iniciada: `contentful login`

## Instalación

```bash
npm install
npm link        # deja disponible el comando `ctf-migrate` globalmente
```

## Uso

```bash
ctf-migrate
```

1. Elige el **space**.
2. Elige el ambiente **origen** y el **destino**.
3. Pega uno o varios **entry IDs** (también acepta URLs de Contentful).
4. Revisa el árbol: la entry que pegaste (**padre**) y las entries a las que apunta (**hijos**), indicando cuáles son nuevas y cuáles ya existen en destino.
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

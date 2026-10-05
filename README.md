# ctf-migrate

Migra entries de Contentful entre ambientes de forma interactiva. **Todo queda en draft.**

## Requisitos

- Node 20+
- Contentful CLI con sesión iniciada: `contentful login`

## Instalación

```bash
cd ctf-migrate
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
4. Revisa el **plan** y confirma.

Solo se migran las entries que pegas. Sus imágenes y media se reutilizan si ya existen en destino y se crean si no. Las entries enlazadas desde ellas no se copian.

## Qué valida antes de escribir

| Check | Qué hace |
| --- | --- |
| Entry existe en origen | Si no, se detiene |
| Modelo desactualizado en destino | Te deja agregar lo que falta, migrar sin esos campos o cancelar |
| Campo con distinto tipo | Se detiene: requiere una migración manual |
| Assets faltantes | Los crea en destino (los que ya existen se reutilizan) |
| Entries enlazadas faltantes | Avisa si la entry quedará con links rotos |
| Locales faltantes | Omite los locales que no existan en destino |
| Tags faltantes | Los crea en destino |

## Garantías

- Nunca publica entries ni assets.
- Nunca borra ni modifica campos existentes del modelo; solo agrega.
- Si una entry ya existe y está publicada, queda como **Changed**: lo publicado sigue en vivo.

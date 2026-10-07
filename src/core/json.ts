/**
 * JSON estable para comparar valores: los arrays de valores simples se ordenan, así el
 * orden no cuenta como diferencia (por ejemplo, en validaciones `in: ['a', 'b']`).
 */
export const stableJson = (value: unknown): string =>
  JSON.stringify(value, (_, v) =>
    Array.isArray(v) && v.every((x) => typeof x !== 'object') ? [...v].sort() : (v as unknown),
  );

/** JSON tal cual, para comparar contenido donde el orden sí importa (listas de links, rich text). */
export const exactJson = (value: unknown): string => JSON.stringify(value);

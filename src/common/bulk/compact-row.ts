/**
 * Devuelve una copia del objeto sin las claves cuyo valor está "vacío":
 * `undefined`, `null`, cadena vacía o array vacío. Sirve para que las columnas
 * opcionales de un CSV (celdas en blanco) no se envíen al DTO/Prisma como valores
 * vacíos. El `0` y el `false` se conservan (son valores legítimos).
 */
export function compactRow<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out as Partial<T>;
}

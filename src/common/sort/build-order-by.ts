import { Prisma } from '@prisma/client';

export type SortDir = 'asc' | 'desc';

// `T` debe inferirse SOLO del mapa de columnas, no del `fallback`. Sin esto, un
// `fallback` como `{ createdAt: 'desc' }` ensancharía `'desc'` a `string` y el
// tipo resultante dejaría de ser asignable al `orderBy` de Prisma. `NoInfer`
// existe en TS ≥5.4; lo definimos localmente para no depender de la versión.
type NoInfer<T> = [T][T extends unknown ? 0 : never];

/**
 * Construye el `orderBy` de Prisma para un listado a partir de los parámetros
 * genéricos `sortBy`/`order` que envía el frontend (cabeceras clickeables del
 * admin), validándolos contra un mapa de columnas permitidas por recurso.
 *
 * El mapa asocia cada clave pública (la que manda el front, p. ej. `price`,
 * `customer`, `items`) con una función que, dada la dirección, produce el
 * fragmento `orderBy`. Eso permite soportar de forma uniforme:
 *   · campos directos      → `(dir) => ({ price: dir })`
 *   · campos de relación   → `(dir) => ({ category: { name: dir } })`
 *   · conteos de relación  → `(dir) => ({ productTags: { _count: dir } })`
 *
 * Si `sortBy` no viene o no está en el mapa, se devuelve `fallback` (el orden por
 * defecto del listado): así un parámetro inesperado nunca rompe la consulta.
 */
export function buildOrderBy<T>(
  sortBy: string | undefined,
  order: SortDir | undefined,
  allowed: Record<string, (dir: Prisma.SortOrder) => T>,
  fallback: NoInfer<T>,
): T {
  if (!sortBy) return fallback;
  const builder = allowed[sortBy];
  if (!builder) return fallback;
  return builder(order === 'desc' ? 'desc' : 'asc');
}

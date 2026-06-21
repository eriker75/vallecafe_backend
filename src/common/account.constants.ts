// Valores válidos del segmento comercial del cliente y de la visibilidad de
// producto. Se modelan como String (no enums físicos de Postgres) por consistencia
// con `role`/`status`/order-status, validándose en TS. Se reutilizan en los DTOs
// (@IsIn) y en la lógica de filtrado/checkout.

export const ACCOUNT_TYPES = ['B2C', 'B2B'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const PRODUCT_VISIBILITIES = ['ALL', 'RETAIL_ONLY', 'WHOLESALE_ONLY'] as const;
export type ProductVisibility = (typeof PRODUCT_VISIBILITIES)[number];

// Visibilidades que cualquiera puede ver/comprar (los productos B2C son SIEMPRE
// públicos). Es la lista blanca de lo público: todo lo que NO esté aquí queda
// restringido a B2B. Se prefiere esta forma (whitelist) a "todo menos
// WHOLESALE_ONLY" para fallar cerrado — un valor de datos inesperado (p. ej.
// legacy 'B2B'/'B2C') nunca debe filtrar un producto mayorista al público.
export const PUBLIC_VISIBILITIES: readonly string[] = ['ALL', 'RETAIL_ONLY'];

// ¿Puede un comprador de este `accountType` ver/comprar un producto con esta
// `visibility`? El admin se gestiona aparte (siempre ve todo).
//
// Regla: los productos públicos (PUBLIC_VISIBILITIES) los ve cualquiera, incluido
// un mayorista. Cualquier otra visibilidad (WHOLESALE_ONLY o un valor no
// reconocido) queda restringida a B2B.
export function canAccessVisibility(
  accountType: string | null | undefined,
  visibility: string | null | undefined,
): boolean {
  if (PUBLIC_VISIBILITIES.includes(visibility ?? '')) return true;
  return accountType === 'B2B';
}

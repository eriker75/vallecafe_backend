-- Extensiones de Postgres que la aplicación necesita y que Prisma no puede
-- declarar en el schema (sin el preview feature `postgresqlExtensions`).
--
-- `unaccent`: búsqueda de productos insensible a acentos. ProductsService usa
-- `unaccent(lower(...))` en SQL crudo (ver src/products/products.service.ts).
-- Aunque el backend también la crea al arrancar (database.service.ts), tenerla
-- aquí garantiza que `prisma migrate deploy` deje la base lista sin depender
-- del orden de arranque (gotcha del deploy en Cloud Run: las extensiones deben
-- existir antes de que el backend las use).
CREATE EXTENSION IF NOT EXISTS unaccent;

-- `postgis` queda fuera a propósito: la geolocalización hoy se guarda como
-- Float (`latitude`/`longitude` en users/addresses) y la extensión no está
-- disponible en todas las imágenes de Postgres. Si se reactiva geografía
-- nativa, añadir una migración nueva con:
--   CREATE EXTENSION IF NOT EXISTS postgis;

-- Hace OPCIONAL payments.orderId. En pago móvil el cliente paga PRIMERO: el
-- abono llega por el webhook de R4 antes de que exista la orden y se guarda como
-- pago "huérfano" (orderId = NULL, status COMPLETED); el checkout lo reclama
-- luego por `reference`. La FK a orders(id) y el índice UNIQUE de orderId NO
-- cambian: en Postgres los NULL no colisionan en un UNIQUE, así que se permiten
-- varios abonos sin orden, pero sigue habiendo a lo sumo un pago por orden.

-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "orderId" DROP NOT NULL;

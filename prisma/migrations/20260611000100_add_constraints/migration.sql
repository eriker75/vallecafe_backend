-- Restricciones CHECK de coherencia de datos. Prisma no soporta CHECK
-- constraints en el schema, por eso viven como migración SQL manual (Prisma
-- Migrate tampoco las detecta como drift, así que conviven sin problema con
-- `migrate dev`). Nota de semántica SQL: en columnas nullable un valor NULL
-- pasa el CHECK, así que no hace falta envolver con `IS NULL OR ...`.

-- products: precios/costos/puntos no negativos, stock no negativo, peso > 0
ALTER TABLE "products"
  ADD CONSTRAINT "products_stock_no_negativo"         CHECK ("stock" >= 0),
  ADD CONSTRAINT "products_price_no_negativo"         CHECK ("price" >= 0),
  ADD CONSTRAINT "products_offer_price_no_negativo"   CHECK ("offerPrice" >= 0),
  ADD CONSTRAINT "products_cost_no_negativo"          CHECK ("cost" >= 0),
  ADD CONSTRAINT "products_weight_positivo"           CHECK ("weightKg" > 0),
  ADD CONSTRAINT "products_points_price_no_negativo"  CHECK ("pointsPrice" >= 0),
  ADD CONSTRAINT "products_points_earned_no_negativo" CHECK ("pointsEarned" >= 0);

-- cart_items / order_items: la compra es por unidades enteras (>= 1) y los
-- snapshots de precio/costo no pueden ser negativos
ALTER TABLE "cart_items"
  ADD CONSTRAINT "cart_items_quantity_positiva" CHECK ("quantity" >= 1);

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_quantity_positiva" CHECK ("quantity" >= 1),
  ADD CONSTRAINT "order_items_price_no_negativo" CHECK ("price" >= 0),
  ADD CONSTRAINT "order_items_cost_no_negativo"  CHECK ("costSnapshot" >= 0);

-- orders: montos y puntos no negativos
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_shipping_no_negativo" CHECK ("shipping" >= 0),
  ADD CONSTRAINT "orders_discount_no_negativo" CHECK ("discount" >= 0),
  ADD CONSTRAINT "orders_total_no_negativo"    CHECK ("total" >= 0),
  ADD CONSTRAINT "orders_points_no_negativos"  CHECK ("pointsEarned" >= 0);

-- coupons: montos/contadores coherentes; un porcentaje no puede superar 100
ALTER TABLE "coupons"
  ADD CONSTRAINT "coupons_amount_no_negativo"      CHECK ("amount" >= 0),
  ADD CONSTRAINT "coupons_usage_count_no_negativo" CHECK ("usageCount" >= 0),
  ADD CONSTRAINT "coupons_usage_limit_positivo"    CHECK ("usageLimit" >= 1),
  ADD CONSTRAINT "coupons_porcentaje_max_100"
    CHECK ("discountType" <> 'PERCENTAGE' OR "amount" <= 100);

-- payments: montos no negativos, tasa BCV positiva
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_no_negativo"     CHECK ("amount" >= 0),
  ADD CONSTRAINT "payments_bcv_rate_positiva"      CHECK ("bcvRate" > 0),
  ADD CONSTRAINT "payments_amount_ves_no_negativo" CHECK ("amountVes" >= 0);

-- bcv_rates: una tasa de cambio siempre es positiva
ALTER TABLE "bcv_rates"
  ADD CONSTRAINT "bcv_rates_rate_positiva" CHECK ("rate" > 0);

-- notifications: contador de envíos no negativo
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_sent_count_no_negativo" CHECK ("sentCount" >= 0);

-- coordenadas geográficas dentro de rango (lat -90..90, lon -180..180)
ALTER TABLE "users"
  ADD CONSTRAINT "users_latitude_valida"  CHECK ("latitude"  BETWEEN -90  AND 90),
  ADD CONSTRAINT "users_longitude_valida" CHECK ("longitude" BETWEEN -180 AND 180);

ALTER TABLE "addresses"
  ADD CONSTRAINT "addresses_latitude_valida"  CHECK ("latitude"  BETWEEN -90  AND 90),
  ADD CONSTRAINT "addresses_longitude_valida" CHECK ("longitude" BETWEEN -180 AND 180);

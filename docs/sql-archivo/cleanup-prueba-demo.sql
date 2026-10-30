-- ESTADO: ESTADO COINCIDE en producción: ya no existen los productos 'PRUEBA - *' y 'agua de prueba' está desactivada (verificado en solo lectura el 2026-10-30; la fecha de aplicación no está registrada). No consta si se corrió este script tal cual.
-- Archivado en docs/sql-archivo/. No volver a ejecutar sin revisar.

-- Limpieza de datos de prueba del tenant demo (0e46b4f4-5f82-473c-b7b8-f04b3bf9fd02). NO EJECUTADO.
-- Uso: railway ssh ... psql; por defecto termina en ROLLBACK. Cambiar a COMMIT solo tras revisar la salida.
--
-- Alcance (ver informe): 3 categorias "PRUEBA - *", 6 productos "PRUEBA - *", el insumo PRUEBA-001 (creados el 2026-09-04
-- 06:45:35 UTC en una sola transaccion SQL) y los 2 productos "agua ..." creados el 2026-10-12 desde la pantalla Productos.
--   * "agua de prueba" tiene 1 venta (VTA-20261013-001): NO se borra, solo se desactiva.
--   * "agua prueba" no tiene ventas: se borra.
--   * La categoria "Bebidas" (3818e7dd-...) es real: no se toca.

BEGIN;

-- 0) Guardas: aborta si algo cambio desde el diagnostico.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM sale
   WHERE items::text ~ '(6130ce83-8b16-47ed-9579-f761f7b0988c|cbbf8209-4ac7-4db2-929f-2aac4bd33ac0|94d1be9b-a31b-4bf3-bbf2-198fdd7501c9|45739a87-bb60-4d18-a1dc-8e8b9351e7e0|747ea198-b8eb-473a-861c-26724ee887a6|a95c690e-d3be-4d3a-ab66-5776ab6a38df|adedadb2-c6d7-4f5c-b2bb-f46f85b8f837)';
  IF n > 0 THEN RAISE EXCEPTION 'Hay % venta(s) que referencian productos PRUEBA; abortado', n; END IF;
  SELECT count(*) INTO n FROM inventory_movements WHERE "insumoId"::text = '1eda85aa-c7a2-4fea-b9bc-b312e238b72b';
  IF n > 0 THEN RAISE EXCEPTION 'El insumo PRUEBA-001 tiene % movimiento(s) de inventario; abortado', n; END IF;
  SELECT count(*) INTO n FROM product WHERE "categoryId" IN ('fced24ac-28ea-49cf-a270-9c41deba3e01','da634622-8af5-409e-81d2-3acb6038f8d5','f466c4a0-017c-4104-8195-e30f36cc1ec7')
     AND name NOT LIKE 'PRUEBA - %';
  IF n > 0 THEN RAISE EXCEPTION 'Hay % producto(s) NO prueba dentro de las categorias PRUEBA; abortado', n; END IF;
END $$;

-- 1) Respaldo (tablas en public; se conservan tras el COMMIT).
CREATE TABLE bak_prueba_20261013_pos_category AS
  SELECT * FROM pos_category WHERE id IN ('fced24ac-28ea-49cf-a270-9c41deba3e01','da634622-8af5-409e-81d2-3acb6038f8d5','f466c4a0-017c-4104-8195-e30f36cc1ec7');
CREATE TABLE bak_prueba_20261013_product AS
  SELECT * FROM product WHERE name ILIKE 'PRUEBA - %' OR id IN ('d8f897e9-d503-4219-a5b6-e8ad8586ebe9','adedadb2-c6d7-4f5c-b2bb-f46f85b8f837');
CREATE TABLE bak_prueba_20261013_insumo AS
  SELECT * FROM insumo WHERE id = '1eda85aa-c7a2-4fea-b9bc-b312e238b72b';
CREATE TABLE bak_prueba_20261013_inventory AS
  SELECT * FROM inventory WHERE "insumoId"::text = '1eda85aa-c7a2-4fea-b9bc-b312e238b72b';

-- 2) Vista previa de lo que se va a tocar.
SELECT 'categorias' AS t, count(*) FROM bak_prueba_20261013_pos_category
UNION ALL SELECT 'productos', count(*) FROM bak_prueba_20261013_product
UNION ALL SELECT 'insumo', count(*) FROM bak_prueba_20261013_insumo
UNION ALL SELECT 'inventory', count(*) FROM bak_prueba_20261013_inventory;

-- 3) Cambios.
UPDATE product SET "isActive" = false, "updatedAt" = now() WHERE id = 'd8f897e9-d503-4219-a5b6-e8ad8586ebe9';   -- agua de prueba (tiene 1 venta)
DELETE FROM product WHERE id = 'adedadb2-c6d7-4f5c-b2bb-f46f85b8f837';                                          -- agua prueba
DELETE FROM product WHERE name LIKE 'PRUEBA - %' AND "tenantId" = '0e46b4f4-5f82-473c-b7b8-f04b3bf9fd02';       -- 6 productos
DELETE FROM pos_category WHERE id IN ('fced24ac-28ea-49cf-a270-9c41deba3e01','da634622-8af5-409e-81d2-3acb6038f8d5','f466c4a0-017c-4104-8195-e30f36cc1ec7');
DELETE FROM inventory WHERE "insumoId"::text = '1eda85aa-c7a2-4fea-b9bc-b312e238b72b';
DELETE FROM insumo WHERE id = '1eda85aa-c7a2-4fea-b9bc-b312e238b72b' AND codigo = 'PRUEBA-001';

-- 4) Verificacion: debe dar 0 en todo menos "agua de prueba" inactivo.
SELECT 'restantes_cat' AS t, count(*) FROM pos_category WHERE name ILIKE 'PRUEBA - %'
UNION ALL SELECT 'restantes_prod', count(*) FROM product WHERE name ILIKE 'PRUEBA - %' OR id = 'adedadb2-c6d7-4f5c-b2bb-f46f85b8f837'
UNION ALL SELECT 'insumo', count(*) FROM insumo WHERE codigo = 'PRUEBA-001'
UNION ALL SELECT 'agua_de_prueba_activa', count(*) FROM product WHERE id = 'd8f897e9-d503-4219-a5b6-e8ad8586ebe9' AND "isActive";

ROLLBACK;  -- cambiar a COMMIT solo despues de revisar la salida

-- ESTADO: RESULTADO VERIFICADO en producción: 0 productos con insumoId/recipeId no UUID (verificado en solo lectura el 2026-10-30; la fecha de aplicación no está registrada). El encabezado original dice 'NO EJECUTADA'; no consta si se corrió este script u otra vía.
-- Archivado en docs/sql-archivo/. No volver a ejecutar sin revisar.

-- LIMPIEZA PROPUESTA — NO EJECUTADA. Productos con insumoId / recipeId que no son UUID (p. ej. 'insumo-2', 'receta-1').
-- Efecto: el producto queda SIN vínculo de inventario (stock mostrado 0 / sin descuento). No se borra ningún producto.
-- Ejecutar en orden: 1) SELECTs (solo lectura), 2) revisar, 3) bloque de UPDATE dentro de BEGIN; por defecto termina en ROLLBACK.

-- 1) CONTEO (solo lectura) ---------------------------------------------------------------------------------------------
SELECT
  COUNT(*) FILTER (WHERE "insumoId" IS NOT NULL AND "insumoId" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') AS insumo_no_uuid,
  COUNT(*) FILTER (WHERE "recipeId" IS NOT NULL AND "recipeId" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') AS receta_no_uuid,
  COUNT(*) FILTER (WHERE "insumoId" = 'insumo-2') AS insumo_2_demo
FROM "product";

-- 2) DETALLE (solo lectura): qué productos y de qué tenant
SELECT p."id", p."tenantId", t."name" AS tenant, p."name", p."type", p."insumoId", p."recipeId", p."branchId", p."isActive"
FROM "product" p
LEFT JOIN "tenant" t ON t."id"::text = p."tenantId"::text
WHERE (p."insumoId" IS NOT NULL AND p."insumoId" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
   OR (p."recipeId" IS NOT NULL AND p."recipeId" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
ORDER BY p."tenantId", p."name";

-- 3) OPCIONAL (solo lectura): UUID válidos que apuntan a un insumo/receta inexistente o de OTRO tenant
SELECT p."id", p."tenantId", p."name", p."insumoId", p."recipeId"
FROM "product" p
WHERE (p."insumoId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       AND NOT EXISTS (SELECT 1 FROM "insumo" i WHERE i."id"::text = p."insumoId" AND i."tenantId"::text = p."tenantId"::text))
   OR (p."recipeId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       AND NOT EXISTS (SELECT 1 FROM "recipe" r WHERE r."id"::text = p."recipeId" AND r."tenantId"::text = p."tenantId"::text));

-- 4) LIMPIEZA (escribe). Respaldo + UPDATE en una transacción. Cambiar ROLLBACK por COMMIT solo tras revisar los conteos.
BEGIN;

CREATE TABLE IF NOT EXISTS "product_vinculos_backup_20261012" AS
SELECT "id", "tenantId", "insumoId", "recipeId", now() AS respaldado_en
FROM "product"
WHERE ("insumoId" IS NOT NULL AND "insumoId" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
   OR ("recipeId" IS NOT NULL AND "recipeId" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

UPDATE "product"
SET "insumoId" = CASE WHEN "insumoId" IS NOT NULL AND "insumoId" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN NULL ELSE "insumoId" END,
    "recipeId" = CASE WHEN "recipeId" IS NOT NULL AND "recipeId" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN NULL ELSE "recipeId" END,
    "updatedAt" = now()
WHERE ("insumoId" IS NOT NULL AND "insumoId" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
   OR ("recipeId" IS NOT NULL AND "recipeId" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

-- Verificación: debe dar 0 y 0
SELECT
  COUNT(*) FILTER (WHERE "insumoId" IS NOT NULL AND "insumoId" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') AS insumo_no_uuid,
  COUNT(*) FILTER (WHERE "recipeId" IS NOT NULL AND "recipeId" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') AS receta_no_uuid
FROM "product";

ROLLBACK;  -- cambiar a COMMIT tras revisar
-- Restaurar si hiciera falta (tras COMMIT):
-- UPDATE "product" p SET "insumoId" = b."insumoId", "recipeId" = b."recipeId" FROM "product_vinculos_backup_20261012" b WHERE b."id" = p."id";

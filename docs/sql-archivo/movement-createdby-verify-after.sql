-- ESTADO: APLICADO en producción: la migración AddCreatedByToMovement1788500000000 consta en la tabla migrations (verificado en solo lectura el 2026-10-30; la fecha de aplicación no está registrada). Verificación posterior, solo lectura.
-- Archivado en docs/sql-archivo/. No volver a ejecutar sin revisar.

-- ============================================================================
-- Verificación DESPUÉS de correr AddCreatedByToMovement1788500000000 en producción.
--
-- NO ESCRIBE NADA. Puro SELECT.
--
--   psql -h <host_produccion> -p <puerto> -U <usuario> -d <bd> -f movement-createdby-verify-after.sql
-- ============================================================================

\timing on

-- 1) La columna ya existe, nullable, sin default.
SELECT column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_name = 'movement' AND column_name = 'createdBy';
-- Esperado: 1 fila — createdBy | character varying | YES

-- 2) Total de filas sin cambiar respecto al snapshot ANTES (ADD COLUMN no borra ni
--    inserta nada).
SELECT count(*) AS total_movement FROM movement;

-- 3) Todo lo existente queda NULL (sin backfill, a propósito — ver comentario de la
--    migración).
SELECT count(*) AS con_createdby_no_null FROM movement WHERE "createdBy" IS NOT NULL;
-- Esperado: 0, hasta que se registre el primer pago de factura después del deploy.

-- 4) Correr DESPUÉS de que alguien registre un pago real de factura (register-payment)
--    tras el deploy — confirma que el flujo nuevo sí lo llena. Ajusta el LIMIT/orden si
--    hace falta ubicar el pago específico.
SELECT id, "accountId", category, concept, amount, "createdBy", "createdAt"
FROM movement
WHERE category = 'PAYMENT'
ORDER BY "createdAt" DESC
LIMIT 5;

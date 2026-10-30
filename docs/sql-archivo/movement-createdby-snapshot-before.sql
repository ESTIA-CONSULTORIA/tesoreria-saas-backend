-- ESTADO: APLICADO en producción: la migración AddCreatedByToMovement1788500000000 consta en la tabla migrations (verificado en solo lectura el 2026-10-30; la fecha de aplicación no está registrada). Snapshot previo, solo lectura; ya no refleja el estado actual.
-- Archivado en docs/sql-archivo/. No volver a ejecutar sin revisar.

-- ============================================================================
-- Snapshot ANTES de correr AddCreatedByToMovement1788500000000 en producción.
-- Confirma que "createdBy" todavía no existe y da una línea base de cuántas filas
-- tiene "movement" hoy.
--
-- NO ESCRIBE NADA. Puro SELECT.
--
--   psql -h <host_produccion> -p <puerto> -U <usuario> -d <bd> -f movement-createdby-snapshot-before.sql
-- ============================================================================

\timing on

SELECT column_name FROM information_schema.columns
WHERE table_name = 'movement' AND column_name = 'createdBy';
-- Esperado: 0 filas (la columna no existe todavía).

SELECT count(*) AS total_movement FROM movement;

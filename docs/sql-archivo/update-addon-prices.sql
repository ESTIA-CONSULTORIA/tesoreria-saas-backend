-- ESTADO: APLICADO en producción: costos=499 y configuracion_pos=299 (verificado en solo lectura el 2026-10-30; la fecha de aplicación no está registrada).
-- Archivado en docs/sql-archivo/. No volver a ejecutar sin revisar.

-- ============================================================================
-- Actualiza el precio de catálogo (modules.defaultPrice) de dos addons —
-- costos y configuracion_pos — de $0 a su precio real. Snapshot ANTES verificado
-- contra producción (misma sesión): ambas filas ya existían con defaultPrice = 0.
--
-- Corresponde al cambio ya aprobado y en main de src/seed/seed.ts (MODULES_CATALOG,
-- commit e35466f) — MODULES_CATALOG solo inserta si la fila no existe, así que ese
-- commit no tocó estas filas; este script es el UPDATE que sí las actualiza.
--
-- Tabla real: "modules" (plural) — @Entity('modules'),
-- src/modules/entities/module.entity.ts:3. NO "module" (singular, no existe — el primer
-- intento de snapshot falló exactamente por esto: "relation module does not exist").
--
-- Rollback: rollback-addon-prices.sql (valores exactos del snapshot ANTES, no asumidos).
--
-- Uso:
--   psql -h <host_produccion> -p <puerto> -U <usuario> -d <bd> -f update-addon-prices.sql
-- ============================================================================

UPDATE modules SET "defaultPrice" = 499 WHERE code = 'costos';
UPDATE modules SET "defaultPrice" = 299 WHERE code = 'configuracion_pos';

-- Verificación inmediata — debe mostrar 499 y 299.
SELECT code, name, "defaultPrice" FROM modules WHERE code IN ('costos', 'configuracion_pos') ORDER BY code;

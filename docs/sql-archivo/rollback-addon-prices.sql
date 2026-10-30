-- ESTADO: NO APLICADO: reversa de referencia de update-addon-prices.sql (en producción siguen los precios nuevos, 499 y 299; verificado en solo lectura el 2026-10-30; la fecha de aplicación no está registrada).
-- Archivado en docs/sql-archivo/. No volver a ejecutar sin revisar.

-- ============================================================================
-- Revierte update-addon-prices.sql a los valores EXACTOS del snapshot ANTES,
-- verificado contra producción (misma sesión, no asumido):
--
--        code        |        name         | defaultPrice (ANTES)
--   configuracion_pos | Configuración POS   | 0
--   costos            | Costos y Producción | 0
--
-- Tabla real: "modules" (plural) — @Entity('modules'),
-- src/modules/entities/module.entity.ts:3.
--
-- Uso:
--   psql -h <host_produccion> -p <puerto> -U <usuario> -d <bd> -f rollback-addon-prices.sql
-- ============================================================================

UPDATE modules SET "defaultPrice" = 0 WHERE code = 'costos';
UPDATE modules SET "defaultPrice" = 0 WHERE code = 'configuracion_pos';

-- Verificación inmediata — debe mostrar 0 y 0, igual que el snapshot ANTES.
SELECT code, name, "defaultPrice" FROM modules WHERE code IN ('costos', 'configuracion_pos') ORDER BY code;

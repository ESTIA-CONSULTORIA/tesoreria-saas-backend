-- ESTADO: APLICADO 2026-10-30 (3 corridas y 10 entradas)
-- Archivado en docs/sql-archivo/. No volver a ejecutar: las filas ya no existen.

-- ============================================================================
-- Limpieza final de las 4 rondas de smoke test de generateReceipts().
--
-- Los 10 HrDocument desechables (rondas 1, 3 y 4) YA se borraron — vía
-- DELETE /hr/documents/:id autenticado, confirmado con 200 y verificado con
-- una relectura después (0 residuales en los 8 empleados de El Sazón).
--
-- Lo único que falta: 3 PayrollRun + sus PayrollEntry. No hay endpoint
-- DELETE para payroll_run/payroll_entry en toda la API (confirmado por
-- código, no por bloqueo) — esta es la única vía que queda.
--
-- El run de la ronda 1 (período 1900-01-01) NO aparece — su limpieza
-- original sí funcionó en su momento (solo el HrDocument de esa ronda
-- había quedado atrás, ya borrado arriba).
--
-- Uso:
--   psql -h <host_produccion> -p <puerto> -U <usuario> -d <bd> -f payroll-smoke-test-final-cleanup.sql
-- ============================================================================

\set ON_ERROR_STOP on

-- Ronda 2 (Ana Martínez, 1901-01-01)
DELETE FROM payroll_entry WHERE "payrollRunId" = 'cb67e24f-618f-40f0-8789-17804682abde';
DELETE FROM payroll_run WHERE id = 'cb67e24f-618f-40f0-8789-17804682abde';

-- Ronda 3 (Carlos Mendoza, 1902-01-01)
DELETE FROM payroll_entry WHERE "payrollRunId" = '404c71fa-0ffa-4d50-8a45-53b61ee63d77';
DELETE FROM payroll_run WHERE id = '404c71fa-0ffa-4d50-8a45-53b61ee63d77';

-- Ronda 4 (los 8 empleados de El Sazón, 1903-01-01)
DELETE FROM payroll_entry WHERE "payrollRunId" = 'e9301fa6-8094-474e-ac8c-fe6faf6023e5';
DELETE FROM payroll_run WHERE id = 'e9301fa6-8094-474e-ac8c-fe6faf6023e5';

-- Confirmación final.
SELECT count(*) AS payroll_run_residuales
FROM payroll_run
WHERE id IN ('cb67e24f-618f-40f0-8789-17804682abde', '404c71fa-0ffa-4d50-8a45-53b61ee63d77', 'e9301fa6-8094-474e-ac8c-fe6faf6023e5');

SELECT count(*) AS hr_document_residuales
FROM hr_document
WHERE nombre IN (
  'Recibo de nómina 1900-01-01 al 1900-01-15',
  'Recibo de nómina 1901-01-01 al 1901-01-15',
  'Recibo de nómina 1902-01-01 al 1902-01-15',
  'Recibo de nómina 1903-01-01 al 1903-01-15'
);

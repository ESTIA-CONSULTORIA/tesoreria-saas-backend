-- Limpieza de solicitudes de RH de ejemplo en el tenant demo (0e46b4f4-5f82-473c-b7b8-f04b3bf9fd02).
-- SIN EJECUTAR. Origen: seed.ts agregaba 1 permiso MEDICO por día (62) y duplicó la vacación de diciembre 2024 (2).
-- Alcance: 62 permission_request de María García + 2 vacation_request, todas PENDIENTE, sin aprobador.
-- No toca la vacación APROBADA de Carlos Mendoza ni nada de otros tenants.
-- Aplicar DESPUÉS de desplegar el seed corregido (si no, el próximo arranque vuelve a crear un permiso).
--
-- Uso:  psql "$DATABASE_PUBLIC_URL" -f cleanup-demo-rh-solicitudes.sql
-- Paso 1 crea los respaldos y SE CONFIRMA solo. Paso 2 corre en una transacción que termina en ROLLBACK:
-- revisa los conteos que imprime y, si son 62 y 2, cambia la última línea a COMMIT y vuelve a ejecutar el paso 2.

-- ───────── PASO 1: respaldo (fuera de la transacción de borrado) ─────────
CREATE TABLE IF NOT EXISTS permission_request_respaldo_20261024 AS
  SELECT * FROM permission_request
  WHERE "tenantId" = '0e46b4f4-5f82-473c-b7b8-f04b3bf9fd02'
    AND "employeeId" = '11ca2253-f024-40d8-a723-6878d6144fe9'
    AND status = 'PENDIENTE' AND "approvedBy" IS NULL AND type = 'MEDICO' AND reason = 'Cita médica';

CREATE TABLE IF NOT EXISTS vacation_request_respaldo_20261024 AS
  SELECT * FROM vacation_request
  WHERE id IN ('e2233218-3c5e-4509-97d5-5d0d1249bfba', '7268a3a8-cbd2-43c3-a75d-91056fa92647')
    AND "tenantId" = '0e46b4f4-5f82-473c-b7b8-f04b3bf9fd02'
    AND status = 'PENDIENTE' AND "approvedBy" IS NULL;

SELECT (SELECT count(*) FROM permission_request_respaldo_20261024) AS permisos_respaldados,
       (SELECT count(*) FROM vacation_request_respaldo_20261024)   AS vacaciones_respaldadas;

-- ───────── PASO 2: borrado con verificación ─────────
BEGIN;

DO $$
DECLARE n_perm int; n_vac int;
BEGIN
  DELETE FROM permission_request p
   USING permission_request_respaldo_20261024 r
   WHERE p.id = r.id AND p.status = 'PENDIENTE' AND p."approvedBy" IS NULL;
  GET DIAGNOSTICS n_perm = ROW_COUNT;

  DELETE FROM vacation_request v
   USING vacation_request_respaldo_20261024 r
   WHERE v.id = r.id AND v.status = 'PENDIENTE' AND v."approvedBy" IS NULL;
  GET DIAGNOSTICS n_vac = ROW_COUNT;

  RAISE NOTICE 'permisos borrados: %, vacaciones borradas: %', n_perm, n_vac;
  IF n_perm > 62 OR n_vac > 2 THEN
    RAISE EXCEPTION 'Se esperaban como máximo 62 permisos y 2 vacaciones; abortando';
  END IF;
END $$;

SELECT (SELECT count(*) FROM permission_request WHERE "employeeId" = '11ca2253-f024-40d8-a723-6878d6144fe9' AND status = 'PENDIENTE') AS permisos_pendientes_restantes,
       (SELECT count(*) FROM vacation_request WHERE "tenantId" = '0e46b4f4-5f82-473c-b7b8-f04b3bf9fd02' AND status = 'PENDIENTE') AS vacaciones_pendientes_restantes;

ROLLBACK;  -- ← cambiar a COMMIT solo después de revisar los conteos de arriba

-- ───────── REVERSA (si ya se confirmó y hay que restaurar) ─────────
-- INSERT INTO permission_request SELECT * FROM permission_request_respaldo_20261024 ON CONFLICT (id) DO NOTHING;
-- INSERT INTO vacation_request   SELECT * FROM vacation_request_respaldo_20261024   ON CONFLICT (id) DO NOTHING;
-- Cuando ya no haga falta: DROP TABLE permission_request_respaldo_20261024, vacation_request_respaldo_20261024;

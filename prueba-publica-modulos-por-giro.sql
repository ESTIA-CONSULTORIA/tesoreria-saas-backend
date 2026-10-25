-- Prueba pública — techo del plan PRUEBA para los módulos por giro. Idempotente. Termina en ROLLBACK: revisa los SELECT y cambia a COMMIT.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prueba-publica-modulos-por-giro.sql
--
-- Agrega al plan PRUEBA los módulos que algún giro necesita: tesoreria (núcleo financiero de todos), costos, compras y proveedores
-- (restaurante y tienda). El plan es el TECHO: qué recibe cada giro lo decide el código (MODULOS_POR_GIRO en giros-prueba.ts) intersectando con
-- estas filas. Orden: desplegar primero el código; este SQL después. No toca tenants ni pruebas existentes (hoy no hay ninguna).
BEGIN;

INSERT INTO "plan_modules" ("planCode", "moduleCode", "included")
SELECT 'PRUEBA', v.m, true
FROM (VALUES ('tesoreria'), ('costos'), ('compras'), ('proveedores')) AS v(m)
WHERE NOT EXISTS (SELECT 1 FROM "plan_modules" p WHERE p."planCode" = 'PRUEBA' AND p."moduleCode" = v.m);

-- Verificación: deben quedar 13 módulos incluidos en PRUEBA.
SELECT count(*) AS modulos_prueba FROM "plan_modules" WHERE "planCode" = 'PRUEBA' AND "included";
SELECT "moduleCode" FROM "plan_modules" WHERE "planCode" = 'PRUEBA' AND "included" ORDER BY 1;

ROLLBACK; -- cambia a COMMIT tras revisar

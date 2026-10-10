-- Módulo `membresias` (gimnasio): catálogo de módulos y plan_modules. SIN EJECUTAR. Idempotente. Termina en ROLLBACK.
-- El módulo solo se activa de verdad en tenants de giro `gimnasio` (src/config/module-giro-requirements.config.ts): aunque la
-- fila de plan exista para BUSINESS/ENTERPRISE, ModulesService.initFromPlan() la salta para cualquier otro giro.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f gimnasio-modulos.sql
BEGIN;

INSERT INTO "modules" (code, name, description, category, "isActive", "isAddon", "defaultPrice")
SELECT 'membresias', 'Membresías', 'Socios, planes, membresías, check-in y reportes (giro gimnasio)', 'gimnasio', true, true, 350
WHERE NOT EXISTS (SELECT 1 FROM "modules" WHERE code = 'membresias');

INSERT INTO "plan_modules" ("planCode", "moduleCode", included)
SELECT p.plan, 'membresias', true
FROM (VALUES ('BUSINESS'), ('ENTERPRISE')) AS p(plan)
WHERE NOT EXISTS (SELECT 1 FROM "plan_modules" pm WHERE pm."planCode" = p.plan AND pm."moduleCode" = 'membresias');

-- Verificación
SELECT code, name, category, "isAddon", "defaultPrice" FROM "modules" WHERE code = 'membresias';
SELECT "planCode", "moduleCode", included FROM "plan_modules" WHERE "moduleCode" = 'membresias' ORDER BY "planCode";

ROLLBACK;  -- cambia a COMMIT; tras revisar

-- Prueba pública, fase PP0 — tabla pruebas_publicas + plan PRUEBA. SIN EJECUTAR. Idempotente (IF NOT EXISTS / WHERE NOT EXISTS).
-- Termina en ROLLBACK: revisa los SELECT y cambia a COMMIT.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prueba-publica-pp0-migration.sql
--
-- Solo CREA una tabla nueva y AGREGA la fila del plan PRUEBA (con sus módulos). No modifica ninguna fila ni tabla existente.
-- El código de PP0 se puede desplegar antes de correr este SQL: la prueba pública está APAGADA por defecto (PRUEBA_PUBLICA_ACTIVA),
-- sus endpoints responden 404 y nada la usa. Para encenderla (NO en PP0) hacen falta además PRUEBA_PUBLICA_SAL, ENCRYPTION_KEY y TURNSTILE_SECRET.
BEGIN;

-- ── 1. pruebas_publicas: solicitudes y pruebas de autoservicio (el correo en claro vive cifrado solo hasta activar; el token solo como hash) ───
CREATE TABLE IF NOT EXISTS "pruebas_publicas" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenantId" character varying,
  "correoHash" character varying(64) NOT NULL,
  "correoDominio" character varying(120) NOT NULL,
  "correoCifrado" text,
  "nombreNegocio" character varying(120) NOT NULL,
  "nombrePersona" character varying(120) NOT NULL,
  "giro" character varying(20) NOT NULL,
  "tokenHash" character varying(64),
  "tokenVenceEn" TIMESTAMPTZ,
  "estado" character varying(16) NOT NULL,
  "ip" character varying(64),
  "venceEn" TIMESTAMPTZ,
  "extendida" boolean NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "PK_pruebas_publicas" PRIMARY KEY ("id"),
  CONSTRAINT "CHK_pruebas_publicas_estado" CHECK ("estado" IN ('SOLICITADA','ACTIVA','VENCIDA','CONVERTIDA','PURGADA','FALLIDA'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pruebas_correo_activa" ON "pruebas_publicas" ("correoHash") WHERE "estado" IN ('SOLICITADA','ACTIVA');
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pruebas_token" ON "pruebas_publicas" ("tokenHash") WHERE "tokenHash" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "IDX_pruebas_estado" ON "pruebas_publicas" ("estado", "venceEn");
CREATE INDEX IF NOT EXISTS "IDX_pruebas_ip" ON "pruebas_publicas" ("ip", "createdAt");
CREATE INDEX IF NOT EXISTS "IDX_pruebas_tenant" ON "pruebas_publicas" ("tenantId");

-- ── 2. Plan PRUEBA (hasta 5 usuarios; sin costos, compras, tesorería, integraciones ni nómina). Idempotente ───────────────
INSERT INTO "plan" ("code", "name", "monthlyPrice", "maxCompanies", "maxBranches", "maxUsers", "isActive") SELECT 'PRUEBA', 'Prueba pública (14 días)', 0, 1, 1, 5, true WHERE NOT EXISTS (SELECT 1 FROM "plan" WHERE "code" = 'PRUEBA');
INSERT INTO "plan_modules" ("planCode", "moduleCode", "included") SELECT 'PRUEBA', 'dashboard', true WHERE NOT EXISTS (SELECT 1 FROM "plan_modules" WHERE "planCode" = 'PRUEBA' AND "moduleCode" = 'dashboard');
INSERT INTO "plan_modules" ("planCode", "moduleCode", "included") SELECT 'PRUEBA', 'usuarios', true WHERE NOT EXISTS (SELECT 1 FROM "plan_modules" WHERE "planCode" = 'PRUEBA' AND "moduleCode" = 'usuarios');
INSERT INTO "plan_modules" ("planCode", "moduleCode", "included") SELECT 'PRUEBA', 'empresas', true WHERE NOT EXISTS (SELECT 1 FROM "plan_modules" WHERE "planCode" = 'PRUEBA' AND "moduleCode" = 'empresas');
INSERT INTO "plan_modules" ("planCode", "moduleCode", "included") SELECT 'PRUEBA', 'sucursales', true WHERE NOT EXISTS (SELECT 1 FROM "plan_modules" WHERE "planCode" = 'PRUEBA' AND "moduleCode" = 'sucursales');
INSERT INTO "plan_modules" ("planCode", "moduleCode", "included") SELECT 'PRUEBA', 'configuracion', true WHERE NOT EXISTS (SELECT 1 FROM "plan_modules" WHERE "planCode" = 'PRUEBA' AND "moduleCode" = 'configuracion');
INSERT INTO "plan_modules" ("planCode", "moduleCode", "included") SELECT 'PRUEBA', 'pos', true WHERE NOT EXISTS (SELECT 1 FROM "plan_modules" WHERE "planCode" = 'PRUEBA' AND "moduleCode" = 'pos');
INSERT INTO "plan_modules" ("planCode", "moduleCode", "included") SELECT 'PRUEBA', 'configuracion_pos', true WHERE NOT EXISTS (SELECT 1 FROM "plan_modules" WHERE "planCode" = 'PRUEBA' AND "moduleCode" = 'configuracion_pos');
INSERT INTO "plan_modules" ("planCode", "moduleCode", "included") SELECT 'PRUEBA', 'reportes', true WHERE NOT EXISTS (SELECT 1 FROM "plan_modules" WHERE "planCode" = 'PRUEBA' AND "moduleCode" = 'reportes');
INSERT INTO "plan_modules" ("planCode", "moduleCode", "included") SELECT 'PRUEBA', 'membresias', true WHERE NOT EXISTS (SELECT 1 FROM "plan_modules" WHERE "planCode" = 'PRUEBA' AND "moduleCode" = 'membresias');

-- ── Verificación (revisa antes de cambiar a COMMIT) ──────────────────────────────────────────────────────────────────────
SELECT table_name FROM information_schema.tables WHERE table_name = 'pruebas_publicas';                       -- 1 fila
SELECT indexname FROM pg_indexes WHERE tablename = 'pruebas_publicas' ORDER BY indexname;                      -- 6 filas (PK + 5)
SELECT code, "maxUsers", "isActive" FROM "plan" WHERE code = 'PRUEBA';                                         -- 1 fila
SELECT "moduleCode" FROM "plan_modules" WHERE "planCode" = 'PRUEBA' ORDER BY "moduleCode";                     -- 9 filas
SELECT (SELECT count(*) FROM pruebas_publicas) AS pruebas;                                                     -- 0

ROLLBACK;  -- cambia a COMMIT; tras revisar

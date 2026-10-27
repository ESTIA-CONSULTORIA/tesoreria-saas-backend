-- POS: autorizaciones de un solo uso para cortesías y descuentos sobre el tope del rol. SIN EJECUTAR. Idempotente (IF NOT EXISTS).
-- Termina en ROLLBACK: revisa los SELECT y cambia a COMMIT.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f pos-autorizaciones-migration.sql
--
-- Solo CREA una tabla nueva; no modifica ninguna fila ni tabla existente. Correrlo ANTES de desplegar el código: mientras la tabla no exista,
-- pedir o usar una autorización responde error (500) y NADA se autoriza; las ventas normales, y las cortesías y descuentos de un gerente o
-- administrador con sesión propia, no dependen de esta tabla.
--
-- Qué guarda: por autorización, el hash del token (nunca el token), tipo, motivo, hash de las líneas del ticket, quién autorizó, quién la pidió,
-- vigencia (2 min) y cuándo se usó. Sin contraseñas ni NIP.
BEGIN;

CREATE TABLE IF NOT EXISTS "pos_autorizaciones" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenantId" character varying(64) NOT NULL,
  "tokenHash" character varying(64) NOT NULL,
  "tipo" character varying(10) NOT NULL,
  "motivo" character varying(40) NOT NULL,
  "hashLineas" character varying(64) NOT NULL,
  "autorizadoPorId" character varying(64) NOT NULL,
  "autorizadoPorEmail" character varying(255) NOT NULL,
  "autorizadoPorRol" character varying(20) NOT NULL,
  "solicitadoPorId" character varying(64) NOT NULL,
  "solicitadoPorEmail" character varying(255) NOT NULL,
  "expiraEn" TIMESTAMP NOT NULL,
  "usadoEn" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "PK_pos_autorizaciones" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_pos_autorizaciones_token" UNIQUE ("tokenHash"),
  CONSTRAINT "CHK_pos_autorizaciones_tipo" CHECK ("tipo" IN ('CORTESIA','DESCUENTO'))
);
CREATE INDEX IF NOT EXISTS "IDX_pos_autorizaciones_tenant_fecha" ON "pos_autorizaciones" ("tenantId", "createdAt");

-- Verificación: la tabla existe y está vacía.
SELECT to_regclass('public.pos_autorizaciones') IS NOT NULL AS existe, (SELECT count(*) FROM "pos_autorizaciones") AS filas;

ROLLBACK; -- cambia a COMMIT tras revisar

-- CFDI 4.0, fase 0 (datos fiscales) — 4 tablas nuevas. SIN EJECUTAR. Idempotente (IF NOT EXISTS). Termina en ROLLBACK: revisa los
-- SELECT y cambia a COMMIT.
--
--   Tablas: fiscal_emisores · fiscal_sucursales · fiscal_productos · receptores_fiscales
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f facturacion-f0-migration.sql
--
-- No toca NINGUNA tabla existente (ni company, branch, product, sale, socios): las claves fiscales viven en tablas propias ligadas
-- por id. Por eso el código de F0 se puede desplegar ANTES de correr este SQL: lo único que fallará (500) son los endpoints nuevos
-- /facturacion/*; POS, caja y el resto del sistema no se afectan. Sin este SQL tampoco se puede capturar nada fiscal.
-- Convención del repo: columnas camelCase entre comillas, ids uuid (uuid_generate_v4).
-- Fuera de F0 (NO incluido): CSD, provider_binding, invoice, columnas en sale. La propina y el código de autofactura llegan con F3.
BEGIN;

-- ── 1. fiscal_emisores: datos fiscales del emisor (una fila por empresa) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fiscal_emisores" (
  "id"                uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenantId"          character varying NOT NULL,
  "companyId"         character varying NOT NULL,
  "rfc"               character varying(13) NOT NULL,
  "nombreFiscal"      character varying(254) NOT NULL,
  "regimenFiscal"     character varying(3) NOT NULL,
  "serie"             character varying(25),
  "folioActual"       integer NOT NULL DEFAULT 1,
  "facturacionActiva" boolean NOT NULL DEFAULT false,
  "createdAt"         TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt"         TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "PK_fiscal_emisores" PRIMARY KEY ("id"),
  CONSTRAINT "CHK_fiscal_emisores_folio" CHECK ("folioActual" >= 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_fiscal_emisores_company" ON "fiscal_emisores" ("companyId");
CREATE INDEX IF NOT EXISTS "IDX_fiscal_emisores_tenant" ON "fiscal_emisores" ("tenantId");

-- ── 2. fiscal_sucursales: código postal de expedición de cada sucursal ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fiscal_sucursales" (
  "id"                     uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenantId"               character varying NOT NULL,
  "branchId"               character varying NOT NULL,
  "codigoPostalExpedicion" character varying(5) NOT NULL,
  "createdAt"              TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt"              TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "PK_fiscal_sucursales" PRIMARY KEY ("id"),
  CONSTRAINT "CHK_fiscal_sucursales_cp" CHECK ("codigoPostalExpedicion" ~ '^[0-9]{5}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_fiscal_sucursales_branch" ON "fiscal_sucursales" ("branchId");
CREATE INDEX IF NOT EXISTS "IDX_fiscal_sucursales_tenant" ON "fiscal_sucursales" ("tenantId");

-- ── 3. fiscal_productos: claves SAT por producto (la tasa de IVA sigue en product."tasaIva") ─────────────────────────────
CREATE TABLE IF NOT EXISTS "fiscal_productos" (
  "id"            uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenantId"      character varying NOT NULL,
  "productId"     character varying NOT NULL,
  "claveProdServ" character varying(8) NOT NULL,
  "claveUnidad"   character varying(3) NOT NULL,
  "unidadNombre"  character varying(40),
  "objetoImp"     character varying(2) NOT NULL,
  "createdAt"     TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt"     TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "PK_fiscal_productos" PRIMARY KEY ("id"),
  CONSTRAINT "CHK_fiscal_productos_claveProdServ" CHECK ("claveProdServ" ~ '^[0-9]{8}$'),
  CONSTRAINT "CHK_fiscal_productos_objetoImp" CHECK ("objetoImp" IN ('01','02','03','04'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_fiscal_productos_product" ON "fiscal_productos" ("productId");
CREATE INDEX IF NOT EXISTS "IDX_fiscal_productos_tenant" ON "fiscal_productos" ("tenantId");

-- ── 4. receptores_fiscales: perfil fiscal del cliente/socio (reutilizable por caja, mesas y autofactura) ─────────────────
CREATE TABLE IF NOT EXISTS "receptores_fiscales" (
  "id"             uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenantId"       character varying NOT NULL,
  "rfc"            character varying(13) NOT NULL,
  "nombreFiscal"   character varying(254) NOT NULL,
  "codigoPostal"   character varying(5) NOT NULL,
  "regimenFiscal"  character varying(3) NOT NULL,
  "usoCfdiDefault" character varying(4),
  "email"          character varying(254),
  "esExtranjero"   boolean NOT NULL DEFAULT false,
  "validadoEn"     TIMESTAMPTZ,
  "createdAt"      TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt"      TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "PK_receptores_fiscales" PRIMARY KEY ("id"),
  CONSTRAINT "CHK_receptores_fiscales_cp" CHECK ("codigoPostal" ~ '^[0-9]{5}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_receptores_fiscales_tenant_rfc_cp" ON "receptores_fiscales" ("tenantId", "rfc", "codigoPostal");
CREATE INDEX IF NOT EXISTS "IDX_receptores_fiscales_tenant_rfc" ON "receptores_fiscales" ("tenantId", "rfc");

-- Deja constancia en la tabla de migraciones de TypeORM para que `migration:run` no la repita.
INSERT INTO "migrations" ("timestamp", "name")
SELECT 1789400000000, 'CreateFacturacionF01789400000000'
WHERE NOT EXISTS (SELECT 1 FROM "migrations" WHERE "name" = 'CreateFacturacionF01789400000000');

-- ── Verificación ──────────────────────────────────────────────────────────────────────────────────────────────────────────
SELECT table_name FROM information_schema.tables
 WHERE table_name IN ('fiscal_emisores','fiscal_sucursales','fiscal_productos','receptores_fiscales') ORDER BY table_name;  -- 4 filas
SELECT table_name, count(*) AS columnas FROM information_schema.columns
 WHERE table_name IN ('fiscal_emisores','fiscal_sucursales','fiscal_productos','receptores_fiscales') GROUP BY table_name ORDER BY table_name;
SELECT conname, conrelid::regclass AS tabla FROM pg_constraint
 WHERE conrelid::regclass::text IN ('fiscal_emisores','fiscal_sucursales','fiscal_productos','receptores_fiscales') ORDER BY 2, 1;
SELECT indexname FROM pg_indexes
 WHERE tablename IN ('fiscal_emisores','fiscal_sucursales','fiscal_productos','receptores_fiscales') ORDER BY 1;

ROLLBACK;  -- cambia a COMMIT; tras revisar

-- Reversa (si hiciera falta; las tablas son nuevas, no hay datos de otro módulo que perder):
--   DROP TABLE IF EXISTS "receptores_fiscales"; DROP TABLE IF EXISTS "fiscal_productos";
--   DROP TABLE IF EXISTS "fiscal_sucursales";   DROP TABLE IF EXISTS "fiscal_emisores";
--   DELETE FROM "migrations" WHERE "name" = 'CreateFacturacionF01789400000000';

-- CFDI 4.0, fase 1 (CSD, facturas desde caja, nota de crédito) — 5 tablas nuevas. SIN EJECUTAR. Idempotente (IF NOT EXISTS).
-- Termina en ROLLBACK: revisa los SELECT y cambia a COMMIT.
--
--   Tablas: fiscal_csd · fiscal_series · facturas · factura_ventas · factura_eventos
--   Requiere haber corrido antes facturacion-f0-migration.sql.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f facturacion-f1-migration.sql
--
-- No toca NINGUNA tabla existente (ni sale, ni shift, ni company). Cobrar nunca depende de estas tablas: el código de F1 se puede
-- desplegar ANTES de correr este SQL; lo único que fallará (500) son los endpoints nuevos /facturacion/facturas y /facturacion/csd.
-- TODO comprobante de esta fase es SIN VALIDEZ FISCAL (adaptador Mock): la restricción CHK_facturas_sin_validez lo garantiza en la
-- base de datos; cuando exista timbrado real (F2), una migración posterior la reemplazará de forma explícita.
BEGIN;

-- ── 1. fiscal_csd: certificado de sello digital por empresa (llave y contraseña CIFRADAS con ENCRYPTION_KEY, AES-256-GCM) ───
CREATE TABLE IF NOT EXISTS "fiscal_csd" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenantId" character varying NOT NULL,
  "companyId" character varying NOT NULL,
  "numeroCertificado" character varying(20) NOT NULL,
  "rfc" character varying(13) NOT NULL,
  "vigenteDesde" TIMESTAMPTZ NOT NULL,
  "vigenteHasta" TIMESTAMPTZ NOT NULL,
  "cerPem" text NOT NULL,
  "keyCifrado" text NOT NULL,
  "passwordCifrado" text NOT NULL,
  "activo" boolean NOT NULL DEFAULT true,
  "cargadoPor" character varying(120),
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "PK_fiscal_csd" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_fiscal_csd_activo" ON "fiscal_csd" ("companyId") WHERE "activo";
CREATE INDEX IF NOT EXISTS "IDX_fiscal_csd_tenant" ON "fiscal_csd" ("tenantId");

-- ── 2. fiscal_series: folio consecutivo por empresa, tipo (I ingreso, E egreso) y serie. Se incrementa en una sola sentencia (sin carreras) ───
CREATE TABLE IF NOT EXISTS "fiscal_series" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenantId" character varying NOT NULL,
  "companyId" character varying NOT NULL,
  "tipo" character varying(1) NOT NULL,
  "serie" character varying(25) NOT NULL,
  "folioActual" integer NOT NULL DEFAULT 0,
  CONSTRAINT "PK_fiscal_series" PRIMARY KEY ("id"),
  CONSTRAINT "CHK_fiscal_series_tipo" CHECK ("tipo" IN ('I','E')),
  CONSTRAINT "CHK_fiscal_series_folio" CHECK ("folioActual" >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_fiscal_series" ON "fiscal_series" ("companyId", "tipo", "serie");

-- ── 3. facturas: el comprobante. TODA fila de esta fase lleva sinValidezFiscal = true (adaptador Mock, sin timbrado real) ───
CREATE TABLE IF NOT EXISTS "facturas" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenantId" character varying NOT NULL,
  "companyId" character varying NOT NULL,
  "tipo" character varying(1) NOT NULL,
  "estado" character varying(24) NOT NULL,
  "serie" character varying(25),
  "folio" integer,
  "uuid" character varying(36),
  "receptorFiscalId" uuid,
  "usoCfdi" character varying(4),
  "formaPago" character varying(2),
  "metodoPago" character varying(3),
  "subtotal" numeric(14,2) NOT NULL,
  "impuestos" numeric(14,2) NOT NULL DEFAULT 0,
  "total" numeric(14,2) NOT NULL,
  "entrada" jsonb NOT NULL,
  "ventaId" uuid,
  "relacionadaFacturaId" uuid,
  "relacionadoUuid" character varying(36),
  "tipoRelacion" character varying(2),
  "conceptosAcreditados" jsonb,
  "claveIdempotencia" character varying(80) NOT NULL,
  "fechaTimbrado" TIMESTAMPTZ,
  "xml" text,
  "xmlHash" character varying(64),
  "sinValidezFiscal" boolean NOT NULL DEFAULT true,
  "errorCodigo" character varying(60),
  "errorMensaje" text,
  "motivoCancelacion" character varying(2),
  "creadoPor" character varying(120),
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "PK_facturas" PRIMARY KEY ("id"),
  CONSTRAINT "CHK_facturas_tipo" CHECK ("tipo" IN ('I','E')),
  CONSTRAINT "CHK_facturas_estado" CHECK ("estado" IN ('LISTO','PENDIENTE','TIMBRADO','ERROR_VALIDACION','INCIERTO','CANCELACION_PENDIENTE','CANCELADO')),
  CONSTRAINT "CHK_facturas_sin_validez" CHECK ("sinValidezFiscal" = true)
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_facturas_clave" ON "facturas" ("tenantId", "claveIdempotencia");
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_facturas_uuid" ON "facturas" ("uuid") WHERE "uuid" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "IDX_facturas_tenant_estado" ON "facturas" ("tenantId", "estado");
CREATE INDEX IF NOT EXISTS "IDX_facturas_venta" ON "facturas" ("ventaId");
CREATE INDEX IF NOT EXISTS "IDX_facturas_relacionada" ON "facturas" ("relacionadaFacturaId");

-- ── 4. factura_ventas: candado anti-doble facturación — una venta solo puede tener UNA factura de ingreso activa ──────────
CREATE TABLE IF NOT EXISTS "factura_ventas" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenantId" character varying NOT NULL,
  "facturaId" uuid NOT NULL,
  "ventaId" uuid NOT NULL,
  "importe" numeric(14,2) NOT NULL,
  "activa" boolean NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "PK_factura_ventas" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_factura_ventas_venta_activa" ON "factura_ventas" ("ventaId") WHERE "activa";
CREATE INDEX IF NOT EXISTS "IDX_factura_ventas_factura" ON "factura_ventas" ("facturaId");
CREATE INDEX IF NOT EXISTS "IDX_factura_ventas_tenant" ON "factura_ventas" ("tenantId");

-- ── 5. factura_eventos: bitácora de cada cambio de estado (quién y cuándo) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "factura_eventos" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenantId" character varying NOT NULL,
  "facturaId" uuid NOT NULL,
  "evento" character varying(40) NOT NULL,
  "detalle" jsonb,
  "actor" character varying(120),
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "PK_factura_eventos" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "IDX_factura_eventos_factura" ON "factura_eventos" ("tenantId", "facturaId");

-- ── Verificación (revisa antes de cambiar a COMMIT) ──────────────────────────────────────────────────────────────────────
SELECT table_name FROM information_schema.tables
 WHERE table_name IN ('fiscal_csd','fiscal_series','facturas','factura_ventas','factura_eventos') ORDER BY table_name;   -- 5 filas
SELECT tablename, indexname FROM pg_indexes
 WHERE tablename IN ('fiscal_csd','fiscal_series','facturas','factura_ventas','factura_eventos') ORDER BY tablename, indexname;
SELECT conname FROM pg_constraint WHERE conname IN ('CHK_facturas_sin_validez','CHK_facturas_estado','CHK_facturas_tipo','CHK_fiscal_series_tipo');  -- 4 filas
SELECT (SELECT count(*) FROM facturas) AS facturas, (SELECT count(*) FROM fiscal_csd) AS csd;   -- 0 y 0 en una base nueva

ROLLBACK;  -- cambia a COMMIT; tras revisar

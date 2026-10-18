import { MigrationInterface, QueryRunner } from "typeorm";

// CFDI 4.0 fase 1: 5 tablas nuevas (CSD cifrado, series, facturas, candado anti-doble facturación, bitácora). Todo SIN validez fiscal
// (adaptador Mock). El SQL para revisar y correr a mano vive en facturacion-f1-migration.sql (raíz del backend); esto es el mismo
// contenido para `migration:run` en bases nuevas. Idempotente (IF NOT EXISTS). Requiere CreateFacturacionF0.
export class CreateFacturacionF11789500000000 implements MigrationInterface {
    name = 'CreateFacturacionF11789500000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "fiscal_csd" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantId" character varying NOT NULL, "companyId" character varying NOT NULL, "numeroCertificado" character varying(20) NOT NULL, "rfc" character varying(13) NOT NULL, "vigenteDesde" TIMESTAMPTZ NOT NULL, "vigenteHasta" TIMESTAMPTZ NOT NULL, "cerPem" text NOT NULL, "keyCifrado" text NOT NULL, "passwordCifrado" text NOT NULL, "activo" boolean NOT NULL DEFAULT true, "cargadoPor" character varying(120), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_fiscal_csd" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_fiscal_csd_activo" ON "fiscal_csd" ("companyId") WHERE "activo"`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_fiscal_csd_tenant" ON "fiscal_csd" ("tenantId")`);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "fiscal_series" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantId" character varying NOT NULL, "companyId" character varying NOT NULL, "tipo" character varying(1) NOT NULL, "serie" character varying(25) NOT NULL, "folioActual" integer NOT NULL DEFAULT 0, CONSTRAINT "PK_fiscal_series" PRIMARY KEY ("id"), CONSTRAINT "CHK_fiscal_series_tipo" CHECK ("tipo" IN ('I','E')), CONSTRAINT "CHK_fiscal_series_folio" CHECK ("folioActual" >= 0))`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_fiscal_series" ON "fiscal_series" ("companyId", "tipo", "serie")`);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "facturas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantId" character varying NOT NULL, "companyId" character varying NOT NULL, "tipo" character varying(1) NOT NULL, "estado" character varying(24) NOT NULL, "serie" character varying(25), "folio" integer, "uuid" character varying(36), "receptorFiscalId" uuid, "usoCfdi" character varying(4), "formaPago" character varying(2), "metodoPago" character varying(3), "subtotal" numeric(14,2) NOT NULL, "impuestos" numeric(14,2) NOT NULL DEFAULT 0, "total" numeric(14,2) NOT NULL, "entrada" jsonb NOT NULL, "ventaId" uuid, "relacionadaFacturaId" uuid, "relacionadoUuid" character varying(36), "tipoRelacion" character varying(2), "conceptosAcreditados" jsonb, "claveIdempotencia" character varying(80) NOT NULL, "fechaTimbrado" TIMESTAMPTZ, "xml" text, "xmlHash" character varying(64), "sinValidezFiscal" boolean NOT NULL DEFAULT true, "errorCodigo" character varying(60), "errorMensaje" text, "motivoCancelacion" character varying(2), "creadoPor" character varying(120), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_facturas" PRIMARY KEY ("id"), CONSTRAINT "CHK_facturas_tipo" CHECK ("tipo" IN ('I','E')), CONSTRAINT "CHK_facturas_estado" CHECK ("estado" IN ('LISTO','PENDIENTE','TIMBRADO','ERROR_VALIDACION','INCIERTO','CANCELACION_PENDIENTE','CANCELADO')), CONSTRAINT "CHK_facturas_sin_validez" CHECK ("sinValidezFiscal" = true))`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_facturas_clave" ON "facturas" ("tenantId", "claveIdempotencia")`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_facturas_uuid" ON "facturas" ("uuid") WHERE "uuid" IS NOT NULL`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_facturas_tenant_estado" ON "facturas" ("tenantId", "estado")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_facturas_venta" ON "facturas" ("ventaId")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_facturas_relacionada" ON "facturas" ("relacionadaFacturaId")`);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "factura_ventas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantId" character varying NOT NULL, "facturaId" uuid NOT NULL, "ventaId" uuid NOT NULL, "importe" numeric(14,2) NOT NULL, "activa" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_factura_ventas" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_factura_ventas_venta_activa" ON "factura_ventas" ("ventaId") WHERE "activa"`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_factura_ventas_factura" ON "factura_ventas" ("facturaId")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_factura_ventas_tenant" ON "factura_ventas" ("tenantId")`);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "factura_eventos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantId" character varying NOT NULL, "facturaId" uuid NOT NULL, "evento" character varying(40) NOT NULL, "detalle" jsonb, "actor" character varying(120), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_factura_eventos" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_factura_eventos_factura" ON "factura_eventos" ("tenantId", "facturaId")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "factura_eventos"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "factura_ventas"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "facturas"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "fiscal_series"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "fiscal_csd"`);
    }
}

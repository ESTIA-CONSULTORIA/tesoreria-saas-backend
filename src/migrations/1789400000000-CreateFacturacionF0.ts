import { MigrationInterface, QueryRunner } from "typeorm";

// CFDI 4.0 fase 0: 4 tablas nuevas de datos fiscales. El SQL para revisar y correr a mano vive en facturacion-f0-migration.sql
// (raíz del backend); esto es el mismo contenido para `migration:run` en bases nuevas. Idempotente (IF NOT EXISTS).
export class CreateFacturacionF01789400000000 implements MigrationInterface {
    name = 'CreateFacturacionF01789400000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "fiscal_emisores" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantId" character varying NOT NULL, "companyId" character varying NOT NULL, "rfc" character varying(13) NOT NULL, "nombreFiscal" character varying(254) NOT NULL, "regimenFiscal" character varying(3) NOT NULL, "serie" character varying(25), "folioActual" integer NOT NULL DEFAULT 1, "facturacionActiva" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_fiscal_emisores" PRIMARY KEY ("id"), CONSTRAINT "CHK_fiscal_emisores_folio" CHECK ("folioActual" >= 1))`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_fiscal_emisores_company" ON "fiscal_emisores" ("companyId")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_fiscal_emisores_tenant" ON "fiscal_emisores" ("tenantId")`);

        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "fiscal_sucursales" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantId" character varying NOT NULL, "branchId" character varying NOT NULL, "codigoPostalExpedicion" character varying(5) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_fiscal_sucursales" PRIMARY KEY ("id"), CONSTRAINT "CHK_fiscal_sucursales_cp" CHECK ("codigoPostalExpedicion" ~ '^[0-9]{5}$'))`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_fiscal_sucursales_branch" ON "fiscal_sucursales" ("branchId")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_fiscal_sucursales_tenant" ON "fiscal_sucursales" ("tenantId")`);

        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "fiscal_productos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantId" character varying NOT NULL, "productId" character varying NOT NULL, "claveProdServ" character varying(8) NOT NULL, "claveUnidad" character varying(3) NOT NULL, "unidadNombre" character varying(40), "objetoImp" character varying(2) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_fiscal_productos" PRIMARY KEY ("id"), CONSTRAINT "CHK_fiscal_productos_claveProdServ" CHECK ("claveProdServ" ~ '^[0-9]{8}$'), CONSTRAINT "CHK_fiscal_productos_objetoImp" CHECK ("objetoImp" IN ('01','02','03','04')))`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_fiscal_productos_product" ON "fiscal_productos" ("productId")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_fiscal_productos_tenant" ON "fiscal_productos" ("tenantId")`);

        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "receptores_fiscales" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantId" character varying NOT NULL, "rfc" character varying(13) NOT NULL, "nombreFiscal" character varying(254) NOT NULL, "codigoPostal" character varying(5) NOT NULL, "regimenFiscal" character varying(3) NOT NULL, "usoCfdiDefault" character varying(4), "email" character varying(254), "esExtranjero" boolean NOT NULL DEFAULT false, "validadoEn" TIMESTAMPTZ, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_receptores_fiscales" PRIMARY KEY ("id"), CONSTRAINT "CHK_receptores_fiscales_cp" CHECK ("codigoPostal" ~ '^[0-9]{5}$'))`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_receptores_fiscales_tenant_rfc_cp" ON "receptores_fiscales" ("tenantId", "rfc", "codigoPostal")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_receptores_fiscales_tenant_rfc" ON "receptores_fiscales" ("tenantId", "rfc")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "receptores_fiscales"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "fiscal_productos"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "fiscal_sucursales"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "fiscal_emisores"`);
    }

}

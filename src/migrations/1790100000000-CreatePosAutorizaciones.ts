import { MigrationInterface, QueryRunner } from "typeorm";

// Autorizaciones de un solo uso para cortesías y descuentos sobre el tope. El SQL para revisar y correr a mano vive en
// pos-autorizaciones-migration.sql (raíz del backend); esto es el mismo contenido para `migration:run` en bases nuevas. Idempotente.
export class CreatePosAutorizaciones1790100000000 implements MigrationInterface {
    name = 'CreatePosAutorizaciones1790100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "pos_autorizaciones" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantId" character varying(64) NOT NULL, "tokenHash" character varying(64) NOT NULL, "tipo" character varying(10) NOT NULL, "motivo" character varying(40) NOT NULL, "hashLineas" character varying(64) NOT NULL, "autorizadoPorId" character varying(64) NOT NULL, "autorizadoPorEmail" character varying(255) NOT NULL, "autorizadoPorRol" character varying(20) NOT NULL, "solicitadoPorId" character varying(64) NOT NULL, "solicitadoPorEmail" character varying(255) NOT NULL, "expiraEn" TIMESTAMP NOT NULL, "usadoEn" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_pos_autorizaciones" PRIMARY KEY ("id"), CONSTRAINT "UQ_pos_autorizaciones_token" UNIQUE ("tokenHash"), CONSTRAINT "CHK_pos_autorizaciones_tipo" CHECK ("tipo" IN ('CORTESIA','DESCUENTO')))`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pos_autorizaciones_tenant_fecha" ON "pos_autorizaciones" ("tenantId", "createdAt")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "pos_autorizaciones"`);
    }
}

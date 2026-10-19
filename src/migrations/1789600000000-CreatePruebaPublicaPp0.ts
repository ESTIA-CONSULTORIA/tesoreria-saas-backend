import { MigrationInterface, QueryRunner } from "typeorm";

// Prueba pública PP0: tabla pruebas_publicas + plan PRUEBA con sus módulos. El SQL para revisar y correr a mano vive en
// prueba-publica-pp0-migration.sql (raíz del backend); esto es el mismo contenido para `migration:run` en bases nuevas. Idempotente.
export class CreatePruebaPublicaPp01789600000000 implements MigrationInterface {
    name = 'CreatePruebaPublicaPp01789600000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "pruebas_publicas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantId" character varying, "correoHash" character varying(64) NOT NULL, "correoDominio" character varying(120) NOT NULL, "correoCifrado" text, "nombreNegocio" character varying(120) NOT NULL, "nombrePersona" character varying(120) NOT NULL, "giro" character varying(20) NOT NULL, "avisoAceptadoEn" TIMESTAMPTZ NOT NULL, "avisoVersion" character varying(40) NOT NULL, "avisoUrl" character varying(300) NOT NULL, "tokenHash" character varying(64), "tokenVenceEn" TIMESTAMPTZ, "estado" character varying(16) NOT NULL, "ip" character varying(64), "venceEn" TIMESTAMPTZ, "extendida" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_pruebas_publicas" PRIMARY KEY ("id"), CONSTRAINT "CHK_pruebas_publicas_estado" CHECK ("estado" IN ('SOLICITADA','ACTIVA','VENCIDA','CONVERTIDA','PURGADA','FALLIDA')))`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pruebas_correo_activa" ON "pruebas_publicas" ("correoHash") WHERE "estado" IN ('SOLICITADA','ACTIVA')`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pruebas_token" ON "pruebas_publicas" ("tokenHash") WHERE "tokenHash" IS NOT NULL`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pruebas_estado" ON "pruebas_publicas" ("estado", "venceEn")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pruebas_ip" ON "pruebas_publicas" ("ip", "createdAt")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pruebas_tenant" ON "pruebas_publicas" ("tenantId")`);
        await queryRunner.query(`INSERT INTO "plan" ("code", "name", "monthlyPrice", "maxCompanies", "maxBranches", "maxUsers", "isActive") SELECT 'PRUEBA', 'Prueba pública', 0, 1, 1, 5, true WHERE NOT EXISTS (SELECT 1 FROM "plan" WHERE "code" = 'PRUEBA')`);
        await queryRunner.query(`INSERT INTO "plan_modules" ("planCode", "moduleCode", "included") SELECT 'PRUEBA', 'dashboard', true WHERE NOT EXISTS (SELECT 1 FROM "plan_modules" WHERE "planCode" = 'PRUEBA' AND "moduleCode" = 'dashboard')`);
        await queryRunner.query(`INSERT INTO "plan_modules" ("planCode", "moduleCode", "included") SELECT 'PRUEBA', 'usuarios', true WHERE NOT EXISTS (SELECT 1 FROM "plan_modules" WHERE "planCode" = 'PRUEBA' AND "moduleCode" = 'usuarios')`);
        await queryRunner.query(`INSERT INTO "plan_modules" ("planCode", "moduleCode", "included") SELECT 'PRUEBA', 'empresas', true WHERE NOT EXISTS (SELECT 1 FROM "plan_modules" WHERE "planCode" = 'PRUEBA' AND "moduleCode" = 'empresas')`);
        await queryRunner.query(`INSERT INTO "plan_modules" ("planCode", "moduleCode", "included") SELECT 'PRUEBA', 'sucursales', true WHERE NOT EXISTS (SELECT 1 FROM "plan_modules" WHERE "planCode" = 'PRUEBA' AND "moduleCode" = 'sucursales')`);
        await queryRunner.query(`INSERT INTO "plan_modules" ("planCode", "moduleCode", "included") SELECT 'PRUEBA', 'configuracion', true WHERE NOT EXISTS (SELECT 1 FROM "plan_modules" WHERE "planCode" = 'PRUEBA' AND "moduleCode" = 'configuracion')`);
        await queryRunner.query(`INSERT INTO "plan_modules" ("planCode", "moduleCode", "included") SELECT 'PRUEBA', 'pos', true WHERE NOT EXISTS (SELECT 1 FROM "plan_modules" WHERE "planCode" = 'PRUEBA' AND "moduleCode" = 'pos')`);
        await queryRunner.query(`INSERT INTO "plan_modules" ("planCode", "moduleCode", "included") SELECT 'PRUEBA', 'configuracion_pos', true WHERE NOT EXISTS (SELECT 1 FROM "plan_modules" WHERE "planCode" = 'PRUEBA' AND "moduleCode" = 'configuracion_pos')`);
        await queryRunner.query(`INSERT INTO "plan_modules" ("planCode", "moduleCode", "included") SELECT 'PRUEBA', 'reportes', true WHERE NOT EXISTS (SELECT 1 FROM "plan_modules" WHERE "planCode" = 'PRUEBA' AND "moduleCode" = 'reportes')`);
        await queryRunner.query(`INSERT INTO "plan_modules" ("planCode", "moduleCode", "included") SELECT 'PRUEBA', 'membresias', true WHERE NOT EXISTS (SELECT 1 FROM "plan_modules" WHERE "planCode" = 'PRUEBA' AND "moduleCode" = 'membresias')`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM "plan_modules" WHERE "planCode" = 'PRUEBA'`);
        await queryRunner.query(`DELETE FROM "plan" WHERE "code" = 'PRUEBA'`);
        await queryRunner.query(`DROP TABLE IF EXISTS "pruebas_publicas"`);
    }
}

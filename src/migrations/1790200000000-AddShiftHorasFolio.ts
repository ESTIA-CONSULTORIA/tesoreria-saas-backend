import { MigrationInterface, QueryRunner } from "typeorm";

// Horas reales del turno (abiertoEn, cerradoEn en timestamptz) y folio corto por tenant. El SQL para revisar y correr a mano, con el relleno
// de los turnos existentes, vive en shift-horas-folio-migration.sql (raíz del backend); esto crea lo mismo para `migration:run` en bases
// nuevas (sin turnos que rellenar). Idempotente. horaApertura, horaCierre y fecha se conservan.
export class AddShiftHorasFolio1790200000000 implements MigrationInterface {
    name = 'AddShiftHorasFolio1790200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "shift" ADD COLUMN IF NOT EXISTS "abiertoEn" TIMESTAMPTZ`);
        await queryRunner.query(`ALTER TABLE "shift" ADD COLUMN IF NOT EXISTS "cerradoEn" TIMESTAMPTZ`);
        await queryRunner.query(`ALTER TABLE "shift" ADD COLUMN IF NOT EXISTS "folio" VARCHAR(16)`);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "shift_folio_contador" ("tenantId" character varying(64) NOT NULL, "ultimo" integer NOT NULL DEFAULT 0, CONSTRAINT "PK_shift_folio_contador" PRIMARY KEY ("tenantId"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_shift_tenant_folio" ON "shift" ("tenantId", "folio") WHERE "folio" IS NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_shift_tenant_folio"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "shift_folio_contador"`);
        await queryRunner.query(`ALTER TABLE "shift" DROP COLUMN IF EXISTS "folio"`);
        await queryRunner.query(`ALTER TABLE "shift" DROP COLUMN IF EXISTS "cerradoEn"`);
        await queryRunner.query(`ALTER TABLE "shift" DROP COLUMN IF EXISTS "abiertoEn"`);
    }
}

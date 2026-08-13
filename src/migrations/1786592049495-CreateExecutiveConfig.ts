import { MigrationInterface, QueryRunner } from "typeorm";

// migration:generate contra la BD local capturó drift enorme y no relacionado (mismo caso
// que en migraciones anteriores de esta sesión — la BD local no tiene varias tablas de
// producción). Extraído a mano: el único cambio real es crear la tabla executive_config,
// una fila por tenant con la config de Vista Ejecutiva (tema + qué de los 9 módulos se
// muestran), compartida entre cualquier ADMIN/GERENTE que entre con acceso ejecutivo.
export class CreateExecutiveConfig1786592049495 implements MigrationInterface {
    name = 'CreateExecutiveConfig1786592049495'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "executive_config" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantId" character varying NOT NULL, "theme" character varying NOT NULL DEFAULT 'dark', "modules" json, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_a767e457ae7c15ff9acb1dfcaff" UNIQUE ("tenantId"), CONSTRAINT "PK_314c0663deee4ea47b4eea6584b" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "executive_config"`);
    }

}

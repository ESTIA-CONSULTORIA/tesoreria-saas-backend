import { MigrationInterface, QueryRunner } from "typeorm";

// Preferencias de interfaz por usuario (skin propia). Mismo contenido que ui-prefs-user.sql (raíz del backend). Aditiva e idempotente.
export class AddUiPrefsUser1790000000000 implements MigrationInterface {
    name = 'AddUiPrefsUser1790000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "uiPrefs" jsonb NOT NULL DEFAULT '{}'::jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "uiPrefs"`);
    }
}

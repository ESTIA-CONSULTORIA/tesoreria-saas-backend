import { MigrationInterface, QueryRunner } from "typeorm";

// Fase 6: retiro de FeatureGuard (código ya borrado) y de las 6 columnas allow* que solo
// él leía en la entidad Plan (src/plans/entities/plan.entity.ts). Confirmado con grep por
// acceso de propiedad (plan.allowX) que no hay ningún otro consumidor.
//
// Extraída a mano de un migration:generate contra la BD local — el generador capturó
// correctamente estas 6 columnas, pero mezcladas con drift ajeno (desfase conocido de la
// BD local respecto a producción: tablas y columnas de otras migraciones/features que la
// local no tiene). Se descartó todo lo ajeno; solo queda aquí lo de esta fase. Los defaults
// en down() coinciden exactamente con los de la entidad original (allowTreasury: true,
// las otras 5: false).
export class DropPlanFeatureColumns1786225871651 implements MigrationInterface {
    name = 'DropPlanFeatureColumns1786225871651'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "plan" DROP COLUMN "allowReports"`);
        await queryRunner.query(`ALTER TABLE "plan" DROP COLUMN "allowPayables"`);
        await queryRunner.query(`ALTER TABLE "plan" DROP COLUMN "allowInventory"`);
        await queryRunner.query(`ALTER TABLE "plan" DROP COLUMN "allowReceivables"`);
        await queryRunner.query(`ALTER TABLE "plan" DROP COLUMN "allowPOS"`);
        await queryRunner.query(`ALTER TABLE "plan" DROP COLUMN "allowTreasury"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "plan" ADD "allowTreasury" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`ALTER TABLE "plan" ADD "allowPOS" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "plan" ADD "allowReceivables" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "plan" ADD "allowInventory" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "plan" ADD "allowPayables" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "plan" ADD "allowReports" boolean NOT NULL DEFAULT false`);
    }

}

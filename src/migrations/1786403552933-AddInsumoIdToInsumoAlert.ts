import { MigrationInterface, QueryRunner } from "typeorm";

// Agrega insumoId (nullable) a insumo_alerts: vínculo real al Insumo, para reemplazar
// gradualmente la deduplicación por nombre (texto libre) en InsumoAlertsService.upsert().
// Nullable porque alertas manuales legacy (CorteCajaLite, sin selector de insumo real
// todavía) no tendrán este dato — solo SalesService lo manda desde el día uno.
//
// Extraída a mano de un migration:generate contra la BD local — el generador capturó
// correctamente el ALTER TABLE de esta columna, pero mezclado con drift ajeno (desfase
// conocido de la BD local respecto a producción: tablas y columnas de otras
// migraciones/features que la local no tiene). Se descartó todo lo ajeno; solo queda
// aquí lo de esta fase.
export class AddInsumoIdToInsumoAlert1786403552933 implements MigrationInterface {
    name = 'AddInsumoIdToInsumoAlert1786403552933'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "insumo_alerts" ADD "insumoId" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "insumo_alerts" DROP COLUMN "insumoId"`);
    }

}

import { MigrationInterface, QueryRunner } from "typeorm";

// Prueba pública: techo del plan PRUEBA para los módulos por giro (tesoreria, costos, compras, proveedores). El SQL para revisar y correr a mano
// vive en prueba-publica-modulos-por-giro.sql (raíz del backend); esto es el mismo contenido para `migration:run` en bases nuevas. Idempotente.
export class AddModulosPorGiroPlanPrueba1789800000000 implements MigrationInterface {
    name = 'AddModulosPorGiroPlanPrueba1789800000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        for (const m of ['tesoreria', 'costos', 'compras', 'proveedores']) {
            await queryRunner.query(`INSERT INTO "plan_modules" ("planCode", "moduleCode", "included") SELECT 'PRUEBA', '${m}', true WHERE NOT EXISTS (SELECT 1 FROM "plan_modules" WHERE "planCode" = 'PRUEBA' AND "moduleCode" = '${m}')`);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM "plan_modules" WHERE "planCode" = 'PRUEBA' AND "moduleCode" IN ('tesoreria', 'costos', 'compras', 'proveedores')`);
    }
}

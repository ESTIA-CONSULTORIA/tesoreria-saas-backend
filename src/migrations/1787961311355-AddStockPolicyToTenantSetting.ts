import { MigrationInterface, QueryRunner } from "typeorm";

// Auditoría de seguridad/producto (GoodsHabits, Punto 1): política de stock insuficiente
// configurable por tenant. Default 'PERMITIR_NEGATIVO' — no cambia el comportamiento
// visible de rechazo de ventas para ningún tenant existente (nadie empieza a ver ventas
// bloqueadas sin haberlo configurado). Sí cambia un detalle menor y ya avisado: el
// Math.max(0, ...) que clampaba el stock a 0 se quita en el mismo commit — de ahora en
// adelante 'PERMITIR_NEGATIVO' muestra el déficit real en vez de un 0 que ocultaba el
// dato verdadero.
export class AddStockPolicyToTenantSetting1787961311355 implements MigrationInterface {
    name = 'AddStockPolicyToTenantSetting1787961311355'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tenant_setting" ADD "stockPolicy" character varying NOT NULL DEFAULT 'PERMITIR_NEGATIVO'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tenant_setting" DROP COLUMN "stockPolicy"`);
    }

}

import { MigrationInterface, QueryRunner } from "typeorm";

// POS flexible, capacidad 1 de 5 (venta_directa_producto). Columna nullable sin default —
// ninguna fila existente necesita backfill: TenantSettingsService.hasPosCapability() cae al
// default del config file (src/config/pos-capabilities.config.ts) cuando la clave no está
// presente, así que el comportamiento actual del POS no cambia para ningún tenant existente.
export class AddPosCapabilitiesToTenantSetting1788700000000 implements MigrationInterface {
    name = 'AddPosCapabilitiesToTenantSetting1788700000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tenant_setting" ADD "posCapabilities" json`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tenant_setting" DROP COLUMN "posCapabilities"`);
    }

}

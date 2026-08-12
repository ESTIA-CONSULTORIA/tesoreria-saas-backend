import { MigrationInterface, QueryRunner } from "typeorm";

// migration:generate contra la BD local capturó drift enorme y no relacionado (la BD local
// no tenía varias tablas de producción, entre ellas refresh_tokens, así que generó un CREATE
// TABLE completo en vez de un ALTER COLUMN). Extraído a mano: el único cambio real es hacer
// refresh_tokens.tenantId nullable, mismo patrón que User.tenantId — SOPORTE opera sin tenant
// fijo y su login vía /auth/login rompía el guardado del refresh token con
// "null value in column tenantId of relation refresh_tokens violates not-null constraint".
export class MakeRefreshTokenTenantIdNullable1786525395879 implements MigrationInterface {
    name = 'MakeRefreshTokenTenantIdNullable1786525395879'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ALTER COLUMN "tenantId" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ALTER COLUMN "tenantId" SET NOT NULL`);
    }

}

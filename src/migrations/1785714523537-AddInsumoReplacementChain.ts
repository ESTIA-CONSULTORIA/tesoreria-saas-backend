import { MigrationInterface, QueryRunner } from "typeorm";

export class AddInsumoReplacementChain1785714523537 implements MigrationInterface {
    name = 'AddInsumoReplacementChain1785714523537'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "insumo" ADD "reemplazadoPorId" uuid`);
        await queryRunner.query(`ALTER TABLE "insumo" ADD CONSTRAINT "FK_6db21d82a03e2cd700c4e213929" FOREIGN KEY ("reemplazadoPorId") REFERENCES "insumo"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "insumo" DROP CONSTRAINT "FK_6db21d82a03e2cd700c4e213929"`);
        await queryRunner.query(`ALTER TABLE "insumo" DROP COLUMN "reemplazadoPorId"`);
    }

}

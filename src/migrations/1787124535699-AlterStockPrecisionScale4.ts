import { MigrationInterface, QueryRunner } from "typeorm";

export class AlterStockPrecisionScale41787124535699 implements MigrationInterface {
    name = 'AlterStockPrecisionScale41787124535699'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "recipe" ALTER COLUMN "rendimiento" TYPE numeric(10,4)`);
        await queryRunner.query(`ALTER TABLE "inventory" ALTER COLUMN "inventarioInicial" TYPE numeric(10,4)`);
        await queryRunner.query(`ALTER TABLE "inventory" ALTER COLUMN "entradas" TYPE numeric(10,4)`);
        await queryRunner.query(`ALTER TABLE "inventory" ALTER COLUMN "salidas" TYPE numeric(10,4)`);
        await queryRunner.query(`ALTER TABLE "inventory" ALTER COLUMN "inventarioFinal" TYPE numeric(10,4)`);
        await queryRunner.query(`ALTER TABLE "physical_count" ALTER COLUMN "existenciaTeorica" TYPE numeric(10,4)`);
        await queryRunner.query(`ALTER TABLE "physical_count" ALTER COLUMN "existenciaFisica" TYPE numeric(10,4)`);
        await queryRunner.query(`ALTER TABLE "physical_count" ALTER COLUMN "diferencia" TYPE numeric(10,4)`);
        await queryRunner.query(`ALTER TABLE "insumo" ALTER COLUMN "stockActual" TYPE numeric(10,4)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "insumo" ALTER COLUMN "stockActual" TYPE numeric(10,2)`);
        await queryRunner.query(`ALTER TABLE "physical_count" ALTER COLUMN "diferencia" TYPE numeric(10,2)`);
        await queryRunner.query(`ALTER TABLE "physical_count" ALTER COLUMN "existenciaFisica" TYPE numeric(10,2)`);
        await queryRunner.query(`ALTER TABLE "physical_count" ALTER COLUMN "existenciaTeorica" TYPE numeric(10,2)`);
        await queryRunner.query(`ALTER TABLE "inventory" ALTER COLUMN "inventarioFinal" TYPE numeric(10,2)`);
        await queryRunner.query(`ALTER TABLE "inventory" ALTER COLUMN "salidas" TYPE numeric(10,2)`);
        await queryRunner.query(`ALTER TABLE "inventory" ALTER COLUMN "entradas" TYPE numeric(10,2)`);
        await queryRunner.query(`ALTER TABLE "inventory" ALTER COLUMN "inventarioInicial" TYPE numeric(10,2)`);
        await queryRunner.query(`ALTER TABLE "recipe" ALTER COLUMN "rendimiento" TYPE numeric(10,2)`);
    }

}

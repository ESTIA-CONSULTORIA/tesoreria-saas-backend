import { MigrationInterface, QueryRunner } from "typeorm";

export class AlterCantidadPrecisionScale41785724988613 implements MigrationInterface {
    name = 'AlterCantidadPrecisionScale41785724988613'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "recipe_item" ALTER COLUMN "cantidad" TYPE numeric(10,4)`);
        await queryRunner.query(`ALTER TABLE "insumo" ALTER COLUMN "cantidadPresentacion" TYPE numeric(10,4)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "insumo" ALTER COLUMN "cantidadPresentacion" TYPE numeric(10,2)`);
        await queryRunner.query(`ALTER TABLE "recipe_item" ALTER COLUMN "cantidad" TYPE numeric(10,2)`);
    }

}

import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEsRetroactivoToShift1783406480993 implements MigrationInterface {
    name = 'AddEsRetroactivoToShift1783406480993'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "shift" ADD "esRetroactivo" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "shift" DROP COLUMN "esRetroactivo"`);
    }

}

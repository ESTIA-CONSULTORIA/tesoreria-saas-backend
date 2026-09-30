import { MigrationInterface, QueryRunner } from "typeorm";

// POS flexible, capacidad notas_cocina_barra: estación de preparación por producto.
// Nullable sin default — ningún producto existente queda asignado a una estación
// automáticamente; el comportamiento actual (ninguna nota de cocina/barra) no cambia para
// nadie hasta que un ADMIN asigne la estación explícitamente producto por producto.
export class AddEstacionPreparacionToProduct1788800000000 implements MigrationInterface {
    name = 'AddEstacionPreparacionToProduct1788800000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product" ADD "estacionPreparacion" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "estacionPreparacion"`);
    }

}

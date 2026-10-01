import { MigrationInterface, QueryRunner } from "typeorm";

// POS flexible, capacidad venta_de_servicio: marca explícita de que un producto es un
// concepto (consulta, tratamiento) sin descuento de inventario. Default false — ningún
// producto existente cambia de comportamiento hasta que un ADMIN lo marque explícitamente.
export class AddEsServicioToProduct1789000000000 implements MigrationInterface {
    name = 'AddEsServicioToProduct1789000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product" ADD "esServicio" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "esServicio"`);
    }

}

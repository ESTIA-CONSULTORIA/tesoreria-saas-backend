import { MigrationInterface, QueryRunner } from "typeorm";

// POS flexible, capacidad ligar_venta_a_cita: referencia opcional de una venta a una cita ya
// agendada. Nullable sin default y sin FK real (mismo patrón que Cita.patientId) — ninguna
// venta existente cambia, y una cita puede tener varias ventas ligadas (sin unicidad).
export class AddCitaIdToSale1789100000000 implements MigrationInterface {
    name = 'AddCitaIdToSale1789100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "sale" ADD "citaId" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "sale" DROP COLUMN "citaId"`);
    }

}

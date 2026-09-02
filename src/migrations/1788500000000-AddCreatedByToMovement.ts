import { MigrationInterface, QueryRunner } from "typeorm";

// Auditoría de seguridad (GoodsHabits, verificación PurchasesPage/useAuthStore, Hallazgo 2):
// PurchasesService.registerPayment() recibía data.userId (viene de
// useAuthStore.getState().user?.id en el frontend) y lo descartaba — ni Purchase ni Movement
// tenían dónde guardarlo, confirmado empíricamente contra producción (creado un pago de
// prueba real, el Movement resultante no traía ningún campo de usuario).
//
// Se agrega a Movement, no a Purchase: una factura puede recibir varios pagos parciales de
// personas distintas a lo largo del tiempo, así que solo el evento individual (el movimiento
// de ese pago específico) puede decir con certeza quién lo hizo — un campo único en Purchase
// se sobreescribiría en cada pago parcial y perdería la trazabilidad de los anteriores.
//
// Nullable y sin backfill: los movimientos ya existentes no tienen forma de saber quién los
// creó (el dato nunca se capturó) — no se inventa un valor. Solo los pagos de facturas nuevos,
// vía PurchasesService.registerPayment(), lo llenan desde este momento en adelante. POST
// /movements directo (MovementsController) todavía no lo manda — fuera de este hallazgo.
export class AddCreatedByToMovement1788500000000 implements MigrationInterface {
    name = 'AddCreatedByToMovement1788500000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "movement" ADD "createdBy" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "movement" DROP COLUMN "createdBy"`);
    }

}

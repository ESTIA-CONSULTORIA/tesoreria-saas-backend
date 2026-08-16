import { MigrationInterface, QueryRunner } from "typeorm";

// Escrita a mano (mismo motivo que las migraciones anteriores de esta serie:
// migration:generate contra la BD local arrastra drift de tablas que la local no tiene).
// Dos cambios para DeliveryIngestService (Fase 1 — solo registro financiero, sin
// descuento de inventario ni costeo por receta):
//
// 1) Columnas nuevas en "sale" para ventas origin='DELIVERY' (DeliveryHub Pro). Todas
//    con DEFAULT/nullable para no romper las filas POS existentes, que quedan con
//    origin='POS' y el resto NULL/0. UQ_sale_platform_externalOrderId es la idempotencia
//    ante reintentos del mismo pedido — Postgres no choca NULL con NULL en un UNIQUE
//    estándar, así que las ventas POS (ambas columnas NULL) no se ven afectadas.
//
// 2) Índice único parcial en "bank" para que un mismo branchId no pueda terminar con dos
//    cuentas type='DELIVERY' si dos primeros pedidos casi simultáneos de esa sucursal
//    disparan el auto-create en paralelo (DeliveryIngestService.findOrCreateDeliveryBank
//    ya maneja la colisión 23505 y recupera la cuenta ganadora).
export class AddDeliveryIngestColumns1786846183482 implements MigrationInterface {
    name = 'AddDeliveryIngestColumns1786846183482'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "sale" ADD "origin" character varying NOT NULL DEFAULT 'POS'`);
        await queryRunner.query(`ALTER TABLE "sale" ADD "platform" character varying`);
        await queryRunner.query(`ALTER TABLE "sale" ADD "externalOrderId" character varying`);
        await queryRunner.query(`ALTER TABLE "sale" ADD "platformCommission" numeric(10,2) NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE "sale" ADD "netPayout" numeric(10,2) NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE "sale" ADD "placedAt" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "sale" ADD "deliveredAt" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "sale" ADD CONSTRAINT "UQ_sale_platform_externalOrderId" UNIQUE ("platform", "externalOrderId")`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_bank_branch_delivery" ON "bank" ("branchId") WHERE "type" = 'DELIVERY'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "UQ_bank_branch_delivery"`);
        await queryRunner.query(`ALTER TABLE "sale" DROP CONSTRAINT "UQ_sale_platform_externalOrderId"`);
        await queryRunner.query(`ALTER TABLE "sale" DROP COLUMN "deliveredAt"`);
        await queryRunner.query(`ALTER TABLE "sale" DROP COLUMN "placedAt"`);
        await queryRunner.query(`ALTER TABLE "sale" DROP COLUMN "netPayout"`);
        await queryRunner.query(`ALTER TABLE "sale" DROP COLUMN "platformCommission"`);
        await queryRunner.query(`ALTER TABLE "sale" DROP COLUMN "externalOrderId"`);
        await queryRunner.query(`ALTER TABLE "sale" DROP COLUMN "platform"`);
        await queryRunner.query(`ALTER TABLE "sale" DROP COLUMN "origin"`);
    }

}

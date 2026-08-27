import { MigrationInterface, QueryRunner } from "typeorm";

// Auditoría de seguridad (GoodsHabits, frente Delivery): tabla de cuarentena para pedidos
// de DeliveryHub Pro que llegan para un tenant sin el addon 'delivery' activo en
// tenant_modules. No tocan Sale/Bank/Movement — quedan aquí, sin impacto financiero/en
// reportes, hasta que SOPORTE los resuelve manualmente (activar+reprocesar, o rechazar)
// vía los endpoints nuevos en administration.controller.ts. Escrito a mano, no generado
// con migration:generate (mismo motivo que las migraciones anteriores de esta sesión: la
// BD local no tiene el drift de producción).
export class CreateDeliveryQuarantine1787813059942 implements MigrationInterface {
    name = 'CreateDeliveryQuarantine1787813059942'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "delivery_quarantine" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
            "tenantId" character varying NOT NULL,
            "companyId" character varying NOT NULL,
            "branchId" character varying NOT NULL,
            "platform" character varying NOT NULL,
            "externalOrderId" character varying NOT NULL,
            "payload" jsonb NOT NULL,
            "grossAmount" numeric(10,2) NOT NULL,
            "status" character varying NOT NULL DEFAULT 'PENDING_REVIEW',
            "receivedAt" TIMESTAMP NOT NULL DEFAULT now(),
            "resolvedAt" TIMESTAMP,
            "resolvedBy" character varying,
            "resultingSaleId" character varying,
            CONSTRAINT "PK_delivery_quarantine_id" PRIMARY KEY ("id")
        )`);

        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_delivery_quarantine_platform_externalOrderId" ON "delivery_quarantine" ("platform", "externalOrderId")`);

        // Índice de lookup para el GET /administration/delivery-quarantine?tenantId=...
        await queryRunner.query(`CREATE INDEX "IDX_delivery_quarantine_tenantId" ON "delivery_quarantine" ("tenantId")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_delivery_quarantine_tenantId"`);
        await queryRunner.query(`DROP INDEX "IDX_delivery_quarantine_platform_externalOrderId"`);
        await queryRunner.query(`DROP TABLE "delivery_quarantine"`);
    }

}

import { MigrationInterface, QueryRunner } from "typeorm";

// POS flexible, capacidad notas_cocina_barra: una fila por ítem de venta que requiere
// preparación (no por venta completa) — ver SalesService.generateNotasCocina(). Índice
// compuesto (tenantId, sucursalId, estacion, estado) porque es exactamente lo que filtra
// GET /pos/notas-cocina (la pantalla touch pregunta "pendientes de MI estación en MI
// sucursal" cada pocos segundos vía polling).
export class CreateNotasCocina1788900000000 implements MigrationInterface {
    name = 'CreateNotasCocina1788900000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "notas_cocina" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantId" character varying NOT NULL, "companyId" character varying, "sucursalId" character varying NOT NULL, "saleId" character varying NOT NULL, "productoId" character varying NOT NULL, "nombre" character varying NOT NULL, "cantidad" integer NOT NULL, "estacion" character varying NOT NULL, "estado" character varying NOT NULL DEFAULT 'PENDIENTE', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_notas_cocina_id" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_notas_cocina_tenant_sucursal_estacion_estado" ON "notas_cocina" ("tenantId", "sucursalId", "estacion", "estado")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_notas_cocina_tenant_sucursal_estacion_estado"`);
        await queryRunner.query(`DROP TABLE "notas_cocina"`);
    }

}

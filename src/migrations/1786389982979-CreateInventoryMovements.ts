import { MigrationInterface, QueryRunner } from "typeorm";

// Ledger auditable de movimientos individuales de inventario (entidad InventoryMovement,
// src/costs/entities/inventory-movement.entity.ts). Primer consumidor: SalesService,
// tipo='SALIDA_VENTA' desde deductInsumo(), dentro de la misma transacción de la venta.
//
// Extraída a mano de un migration:generate contra la BD local — el generador capturó
// correctamente el CREATE TABLE de esta tabla, pero mezclado con drift ajeno (desfase
// conocido de la BD local respecto a producción: tablas y columnas de otras
// migraciones/features que la local no tiene). Se descartó todo lo ajeno; solo queda
// aquí lo de esta fase.
export class CreateInventoryMovements1786389982979 implements MigrationInterface {
    name = 'CreateInventoryMovements1786389982979'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "inventory_movements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "insumoId" character varying NOT NULL, "tenantId" character varying NOT NULL, "tipo" character varying NOT NULL, "cantidad" numeric(10,4) NOT NULL, "stockResultante" numeric(10,4) NOT NULL, "costoUnitario" numeric(10,2) NOT NULL, "referencia" character varying, "sucursalId" character varying, "notas" character varying, "fecha" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_d7597827c1dcffae889db3ab873" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "inventory_movements"`);
    }

}

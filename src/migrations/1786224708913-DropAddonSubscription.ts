import { MigrationInterface, QueryRunner } from "typeorm";

// Fase 5: eliminación del Sistema 2 (addons). addon_subscription confirmada vacía en
// producción (0 filas, verificada dos veces en esta sesión) antes de aplicar este DROP.
//
// Escrita a mano, no por migration:generate: la tabla nunca fue creada por una migración
// formal (no aparece en ninguna migración existente del repo, ni en la BD local de
// desarrollo, que tampoco la tiene) — se originó fuera del flujo de migraciones. El up()
// reproduce exactamente el esquema de AddonSubscription (entities/addon-subscription.entity.ts,
// ya borrada) tal como estaba antes de este cambio, para que el down() sea fiel.
export class DropAddonSubscription1786224708913 implements MigrationInterface {
    name = 'DropAddonSubscription1786224708913'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "addon_subscription"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "addon_subscription" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantId" character varying, "moduloNombre" character varying NOT NULL DEFAULT '', "activoDesde" date, "activoHasta" date, "precio" numeric(10,2) NOT NULL DEFAULT '0', "status" character varying NOT NULL DEFAULT 'ACTIVO', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_addon_subscription_id" PRIMARY KEY ("id"))`);
    }

}

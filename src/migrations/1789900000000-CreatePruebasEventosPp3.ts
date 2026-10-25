import { MigrationInterface, QueryRunner } from "typeorm";

// Prueba pública PP3: bitácora de eventos (avisos de fin de prueba idempotentes). El SQL para revisar y correr a mano vive en
// prueba-publica-pp3-migration.sql (raíz del backend); esto es el mismo contenido para `migration:run` en bases nuevas. Idempotente.
export class CreatePruebasEventosPp31789900000000 implements MigrationInterface {
    name = 'CreatePruebasEventosPp31789900000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "pruebas_eventos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "pruebaId" uuid NOT NULL, "tipo" character varying(20) NOT NULL, "estado" character varying(10) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_pruebas_eventos" PRIMARY KEY ("id"), CONSTRAINT "UQ_pruebas_eventos_prueba_tipo" UNIQUE ("pruebaId", "tipo"), CONSTRAINT "CHK_pruebas_eventos_estado" CHECK ("estado" IN ('ENVIANDO','ENVIADO','OMITIDO')))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "pruebas_eventos"`);
    }
}

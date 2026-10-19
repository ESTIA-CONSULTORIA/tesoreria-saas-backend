import { MigrationInterface, QueryRunner } from "typeorm";

// Prueba pública: lista de espera por giro. El SQL para revisar y correr a mano vive en prueba-publica-lista-espera-migration.sql
// (raíz del backend); esto es el mismo contenido para `migration:run` en bases nuevas. Idempotente.
export class CreatePruebaListaEspera1789700000000 implements MigrationInterface {
    name = 'CreatePruebaListaEspera1789700000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "pruebas_lista_espera" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "correoHash" character varying(64) NOT NULL, "correoDominio" character varying(120) NOT NULL, "correoCifrado" text NOT NULL, "giro" character varying(20) NOT NULL, "avisoAceptadoEn" TIMESTAMPTZ NOT NULL, "avisoVersion" character varying(40) NOT NULL, "avisoUrl" character varying(300) NOT NULL, "ip" character varying(64), "avisadoEn" TIMESTAMPTZ, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_pruebas_lista_espera" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_lista_espera_correo_giro" ON "pruebas_lista_espera" ("correoHash", "giro")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_lista_espera_giro" ON "pruebas_lista_espera" ("giro", "avisadoEn")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_lista_espera_ip" ON "pruebas_lista_espera" ("ip", "createdAt")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "pruebas_lista_espera"`);
    }
}

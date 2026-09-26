import { MigrationInterface, QueryRunner } from "typeorm";

// Fase 1 de la agenda de citas médicas (panel interno, sin portal de paciente todavía — ver
// auditoria-erp-business.md). Crea la tabla citas, hermana de consultas
// (src/patients/entities/consulta.entity.ts) — mismos tipos/estilo de columna (character
// varying para todo lo textual, sin FK real a patients, igual que patientId en consultas).
// Índice compuesto (tenantId, doctor, fechaHora) porque la validación de dobles reservas
// (AppointmentsService.findOverlap()) filtra exactamente por esas tres columnas en cada
// create()/update().
export class CreateCitas1788600000000 implements MigrationInterface {
    name = 'CreateCitas1788600000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "citas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantId" character varying NOT NULL, "companyId" character varying, "patientId" character varying NOT NULL, "doctor" character varying NOT NULL, "servicio" character varying NOT NULL, "fechaHora" TIMESTAMP NOT NULL, "duracionMinutos" integer NOT NULL DEFAULT 30, "estado" character varying NOT NULL DEFAULT 'PENDIENTE', "notas" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_citas_id" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_citas_tenant_doctor_fecha" ON "citas" ("tenantId", "doctor", "fechaHora")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_citas_tenant_doctor_fecha"`);
        await queryRunner.query(`DROP TABLE "citas"`);
    }

}

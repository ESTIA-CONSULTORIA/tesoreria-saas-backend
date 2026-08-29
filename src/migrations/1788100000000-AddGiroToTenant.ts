import { MigrationInterface, QueryRunner } from "typeorm";

// Auditoría de producto (GoodsHabits, Hallazgo 3): columna "giro" en tenant + migración de
// datos con el mapeo confirmado por Miguel — Riova Dental es el único tenant real médico
// ('medico_dental'); todo lo demás (Grupo Empresarial Demo y sus empresas, Bocatta, y
// cualquier otro tenant existente) queda en 'generico' vía el DEFAULT de la columna, sin
// necesidad de un UPDATE explícito por cada uno.
//
// Después de fijar el giro, reconcilia tenant_modules: desactiva 'pacientes' para
// cualquier tenant cuyo giro resultante no lo permita (todos salvo medico_dental/
// medico_general, ver module-giro-requirements.config.ts) — sin esto, la columna giro
// quedaría correcta pero Grupo Empresarial Demo seguiría viendo el botón "Pacientes"
// exactamente como en el reporte original del hallazgo, porque tenant_modules no se toca
// solo con el ALTER TABLE.
export class AddGiroToTenant1788100000000 implements MigrationInterface {
    name = 'AddGiroToTenant1788100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tenant" ADD "giro" character varying NOT NULL DEFAULT 'generico'`);

        // Riova Dental — único tenant real médico confirmado. Match por nombre porque no es
        // un tenant de seed.ts (se dio de alta manual vía el panel SOPORTE) — no hay un id
        // fijo que referenciar desde una migración.
        await queryRunner.query(`
            UPDATE "tenant"
            SET "giro" = 'medico_dental'
            WHERE "legalName" ILIKE '%Riova%' OR "tradeName" ILIKE '%Riova%'
        `);

        // Reconciliación: 'pacientes' es hoy el único módulo con requisito de giro (ver
        // module-giro-requirements.config.ts) — si esa lista crece, esta migración puntual
        // no necesita saberlo, ya cumplió su propósito una sola vez.
        await queryRunner.query(`
            UPDATE "tenant_modules"
            SET "status" = 'inactive'
            WHERE "moduleCode" = 'pacientes'
              AND "status" = 'active'
              AND "tenantId" IN (
                SELECT "id" FROM "tenant" WHERE "giro" NOT IN ('medico_dental', 'medico_general')
              )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // No revierte la reconciliación de tenant_modules (data-lossy en la dirección
        // contraria, mismo criterio que el resto de migraciones de este proyecto) — solo
        // quita la columna.
        await queryRunner.query(`ALTER TABLE "tenant" DROP COLUMN "giro"`);
    }

}

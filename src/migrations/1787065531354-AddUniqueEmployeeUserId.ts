import { MigrationInterface, QueryRunner } from "typeorm";

// Escrita a mano (mismo motivo que las migraciones anteriores de esta serie:
// migration:generate contra la BD local arrastra drift de tablas que la local no tiene).
//
// Índice único parcial en "employee" para que un mismo userId no pueda quedar
// vinculado a más de un empleado a la vez (mecanismo de vinculación User↔Employee).
// WHERE "userId" IS NOT NULL para que el personal operativo sin login (userId NULL)
// pueda seguir existiendo en cualquier cantidad — Postgres no choca NULL con NULL en
// un índice único estándar, y acá lo hacemos explícito con el WHERE.
//
// Verificado en prod antes de esta migración (0 duplicados tras corregir un caso real
// de doble alta del mismo gerente — ver commit): sin este paso el CREATE INDEX fallaría.
//
// La validación de aplicación en HrService (createEmployee/updateEmployee) ya rechaza
// un userId repetido con un mensaje claro antes de llegar a la BD; este índice es la
// red de seguridad contra la carrera de dos requests casi simultáneos vinculando al
// mismo userId dos empleados distintos — mismo patrón que UQ_bank_branch_delivery.
export class AddUniqueEmployeeUserId1787065531354 implements MigrationInterface {
    name = 'AddUniqueEmployeeUserId1787065531354'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_employee_userId" ON "employee" ("userId") WHERE "userId" IS NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "UQ_employee_userId"`);
    }

}

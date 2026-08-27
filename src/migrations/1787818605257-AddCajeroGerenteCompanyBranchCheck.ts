import { MigrationInterface, QueryRunner } from "typeorm";

// Auditoría de seguridad (GoodsHabits, último frente): CHECK a nivel de BD, red de
// seguridad real detrás de la validación de users.service.ts (esa protege el camino
// normal vía la API, esta protege contra cualquier UPDATE directo a la tabla que se la
// salte). CAJERO/GERENTE con companyId/branchId NULL rompe el aislamiento por sucursal —
// products/areas/categories.service.ts no filtran si branchId llega vacío (devuelven
// TODAS las sucursales del tenant), sales.service.ts exige sucursalId para vender.
//
// Migración consolidada — reemplaza dos intentos anteriores
// (AddCajeroGerenteCompanyBranchCheck1787815705466, sin la excepción de isActive, y
// RelaxCajeroGerenteCheckForInactive1787817286783, que la agregaba después) que nunca
// llegaron a aplicarse con éxito en ningún ambiente real: la primera fallaba como
// transacción contra el caso real de Bocatta (2 usuarios desactivados sin
// companyId/branchId, y sin la excepción de isActive el constraint los seguía
// rechazando), lo que además bloqueaba que la segunda corriera nunca — TypeORM corre las
// migraciones en orden y no llega a la siguiente si la anterior falla. Confirmado con
// evidencia directa (SELECT contra la tabla migrations, 0 filas para ambos nombres)
// antes de borrar esos dos archivos y reemplazarlos por este, con el constraint final
// correcto desde el inicio — no hay ningún ambiente cuya historia de migraciones
// referencie esos dos nombres, así que no hay nada que reconciliar.
//
// isActive=false exime a propósito (caso real: Bocatta cerró la relación con 2
// CAJERO/GERENTE sin companyId/branchId — se desactivaron en vez de asignarles una
// empresa/sucursal ficticia solo para pasar el constraint). Esta excepción depende de
// auth.service.ts::verifyCredentials() y cashiers.service.ts::loginWithNip() (commit
// aparte, ya en main) bloqueando el login de cuentas con isActive:false — sin ese fix,
// la excepción no protegía nada.
//
// IMPORTANTE — no correr esto sin antes corregir a los usuarios ACTIVOS que hoy violan
// la regla (script de solo lectura: WHERE roleCode IN ('CAJERO','GERENTE') AND
// isActive=true AND (companyId IS NULL OR branchId IS NULL)). Si se corre con datos que
// la violan, Postgres rechaza el ALTER TABLE con un error explícito — mismo
// comportamiento ya confirmado con el intento anterior, no rompe nada existente en
// silencio.
export class AddCajeroGerenteCompanyBranchCheck1787818605257 implements MigrationInterface {
    name = 'AddCajeroGerenteCompanyBranchCheck1787818605257'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "user"
            ADD CONSTRAINT "CHK_user_cajero_gerente_company_branch"
            CHECK ("isActive" = false OR "roleCode" NOT IN ('CAJERO', 'GERENTE') OR ("companyId" IS NOT NULL AND "branchId" IS NOT NULL))
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" DROP CONSTRAINT "CHK_user_cajero_gerente_company_branch"`);
    }

}

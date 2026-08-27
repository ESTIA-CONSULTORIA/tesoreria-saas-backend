import { MigrationInterface, QueryRunner } from "typeorm";

// Auditoría de seguridad (GoodsHabits): reemplaza el CHECK de
// 1787815705466-AddCajeroGerenteCompanyBranchCheck.ts por una versión que exime a los
// usuarios desactivados (isActive:false) — caso real: Bocatta cerró la relación con 2
// CAJERO/GERENTE que nunca tuvieron companyId/branchId asignados; en vez de inventarles
// una empresa/sucursal ficticia solo para pasar el constraint, se desactivan.
//
// Migración NUEVA en vez de editar la anterior a propósito — aunque a esta fecha esa
// migración todavía no se había corrido en ningún ambiente real, nunca se debe mutar una
// ya fusionada a main: si por cualquier motivo ya se hubiera aplicado, editar el archivo
// dejaría la historia de migraciones sin coincidir con lo que de verdad quedó en la BD.
// Corriendo ambas en orden (o solo esta, si la anterior nunca se aplicó) el resultado
// final es el mismo constraint relajado.
//
// Depende de un fix aparte (auth.service.ts::verifyCredentials() y
// cashiers.service.ts::loginWithNip(), mismo commit) que ahora sí bloquea el login de
// cuentas con isActive:false — sin ese fix, esta excepción del CHECK no protegía nada:
// un CAJERO/GERENTE desactivado seguía pudiendo autenticar con normalidad.
export class RelaxCajeroGerenteCheckForInactive1787817286783 implements MigrationInterface {
    name = 'RelaxCajeroGerenteCheckForInactive1787817286783'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "CHK_user_cajero_gerente_company_branch"`);
        await queryRunner.query(`
            ALTER TABLE "user"
            ADD CONSTRAINT "CHK_user_cajero_gerente_company_branch"
            CHECK ("isActive" = false OR "roleCode" NOT IN ('CAJERO', 'GERENTE') OR ("companyId" IS NOT NULL AND "branchId" IS NOT NULL))
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" DROP CONSTRAINT "CHK_user_cajero_gerente_company_branch"`);
        await queryRunner.query(`
            ALTER TABLE "user"
            ADD CONSTRAINT "CHK_user_cajero_gerente_company_branch"
            CHECK ("roleCode" NOT IN ('CAJERO', 'GERENTE') OR ("companyId" IS NOT NULL AND "branchId" IS NOT NULL))
        `);
    }

}

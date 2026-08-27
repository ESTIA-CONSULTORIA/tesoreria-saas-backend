import { MigrationInterface, QueryRunner } from "typeorm";

// Auditoría de seguridad (GoodsHabits, último frente): CHECK a nivel de BD, red de
// seguridad real detrás de la validación de users.service.ts (esa protege el camino
// normal vía la API, esta protege contra cualquier UPDATE directo a la tabla que se la
// salte). CAJERO/GERENTE con companyId/branchId NULL rompe el aislamiento por sucursal —
// products/areas/categories.service.ts no filtran si branchId llega vacío (devuelven
// TODAS las sucursales del tenant), sales.service.ts exige sucursalId para vender.
//
// IMPORTANTE — no correr esto sin antes correr el script de solo lectura y corregir a
// los usuarios que hoy violarían la regla (había 4 en la BD local de desarrollo:
// cajero@demo.com, gerente@demo.com, gerente.sazon@demo.com, gerente.sucursal@demo.com —
// dato de dev, no de producción, pero confirma que el problema es real). Si se corre con
// datos que la violan, Postgres rechaza el ALTER TABLE con un error explícito, no rompe
// nada existente en silencio — pero hay que corregir esos usuarios primero para que la
// migración pueda aplicarse.
export class AddCajeroGerenteCompanyBranchCheck1787815705466 implements MigrationInterface {
    name = 'AddCajeroGerenteCompanyBranchCheck1787815705466'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "user"
            ADD CONSTRAINT "CHK_user_cajero_gerente_company_branch"
            CHECK ("roleCode" NOT IN ('CAJERO', 'GERENTE') OR ("companyId" IS NOT NULL AND "branchId" IS NOT NULL))
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" DROP CONSTRAINT "CHK_user_cajero_gerente_company_branch"`);
    }

}

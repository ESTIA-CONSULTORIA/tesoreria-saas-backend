import { MigrationInterface, QueryRunner } from "typeorm";

// IVA configurable: tasa propia por producto ('16' | '8' | '0' | 'EXENTO'). NULL = usa la del negocio, así que ningún producto
// existente cambia de comportamiento. Columna nullable, sin default, con CHECK de valores: compatible con el código anterior
// (que no la lee ni la escribe). Idempotente (IF NOT EXISTS) para poder correrse a mano antes de la migración formal.
export class AddTasaIvaToProduct1789200000000 implements MigrationInterface {
    name = 'AddTasaIvaToProduct1789200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "tasaIva" character varying(10)`);
        await queryRunner.query(`ALTER TABLE "product" DROP CONSTRAINT IF EXISTS "CHK_product_tasaIva"`);
        await queryRunner.query(`ALTER TABLE "product" ADD CONSTRAINT "CHK_product_tasaIva" CHECK ("tasaIva" IS NULL OR "tasaIva" IN ('16','8','0','EXENTO'))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product" DROP CONSTRAINT IF EXISTS "CHK_product_tasaIva"`);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN IF EXISTS "tasaIva"`);
    }

}

import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRecipeItemAndInsumoPurchaseFields1785644114053 implements MigrationInterface {
    name = 'AddRecipeItemAndInsumoPurchaseFields1785644114053'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "recipe_item" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "recipeId" uuid NOT NULL, "insumoId" uuid, "componentRecipeId" uuid, "cantidad" numeric(10,2) NOT NULL, "unidadMedida" character varying NOT NULL, "tenantId" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "CHK_ef78a926ac7b5fbfd977c29d89" CHECK (("insumoId" IS NOT NULL AND "componentRecipeId" IS NULL) OR ("insumoId" IS NULL AND "componentRecipeId" IS NOT NULL)), CONSTRAINT "PK_bbaf66acc7e7c6dc3d1bc42a247" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "insumo" ADD "precioCompra" numeric(10,2)`);
        await queryRunner.query(`ALTER TABLE "insumo" ADD "cantidadPresentacion" numeric(10,2)`);
        await queryRunner.query(`ALTER TABLE "insumo" ADD "merma" numeric(10,2)`);
        await queryRunner.query(`ALTER TABLE "recipe_item" ADD CONSTRAINT "FK_ca55b4103acde77f1261a7375a4" FOREIGN KEY ("recipeId") REFERENCES "recipe"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "recipe_item" ADD CONSTRAINT "FK_7d4b6f2b67fa24cef8c6fc7c89c" FOREIGN KEY ("insumoId") REFERENCES "insumo"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "recipe_item" ADD CONSTRAINT "FK_d932cf339bd0e8697207922c1ed" FOREIGN KEY ("componentRecipeId") REFERENCES "recipe"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "recipe_item" DROP CONSTRAINT "FK_d932cf339bd0e8697207922c1ed"`);
        await queryRunner.query(`ALTER TABLE "recipe_item" DROP CONSTRAINT "FK_7d4b6f2b67fa24cef8c6fc7c89c"`);
        await queryRunner.query(`ALTER TABLE "recipe_item" DROP CONSTRAINT "FK_ca55b4103acde77f1261a7375a4"`);
        await queryRunner.query(`ALTER TABLE "insumo" DROP COLUMN "merma"`);
        await queryRunner.query(`ALTER TABLE "insumo" DROP COLUMN "cantidadPresentacion"`);
        await queryRunner.query(`ALTER TABLE "insumo" DROP COLUMN "precioCompra"`);
        await queryRunner.query(`DROP TABLE "recipe_item"`);
    }

}

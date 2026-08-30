import { MigrationInterface, QueryRunner } from "typeorm";

// Auditoría de producto (GoodsHabits, Fase 3 — abstracción de Storage): crea stored_file y
// migra las 7 columnas de archivo que "contract" mantenía por su cuenta (contractPdfBase64,
// signedPdfBase64, signedPdfUrl, signatureBase64, selfieBase64, ineFrontBase64,
// ineBackBase64) al modelo nuevo, luego las elimina. contract.id es uuid, stored_file.
// "ownerId" es varchar — mismo mismatch de tipos ya visto en este proyecto (ver
// AddGiroToTenant), de ahí el cast ::text en cada INSERT.
//
// El caso Cloudinary (signedPdfUrl poblado) se reconstruye con el public_id determinístico
// que el código viejo ya usaba: `signed_${contractId}` (ver contracts.service.ts anterior a
// este cambio, uploadBase64(signedPdf, folder, `signed_${dto.contractId}`)) — no hace falta
// haberlo guardado aparte, se puede recalcular.
export class MigrateContractFilesToStoredFile1788200000000 implements MigrationInterface {
    name = 'MigrateContractFilesToStoredFile1788200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "stored_file" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "tenantId" character varying NOT NULL,
                "ownerType" character varying NOT NULL,
                "ownerId" character varying NOT NULL,
                "role" character varying NOT NULL,
                "provider" character varying NOT NULL,
                "providerRef" text NOT NULL,
                "url" character varying,
                "mimeType" character varying,
                "sizeBytes" bigint,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_stored_file_id" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`CREATE INDEX "IDX_stored_file_owner" ON "stored_file" ("ownerType", "ownerId", "role")`);

        await queryRunner.query(`
            INSERT INTO "stored_file" ("tenantId","ownerType","ownerId","role","provider","providerRef","mimeType")
            SELECT "tenantId", 'contract', "id"::text, 'contract_pdf', 'base64_postgres', "contractPdfBase64", 'application/pdf'
            FROM "contract" WHERE "contractPdfBase64" IS NOT NULL AND "contractPdfBase64" <> ''
        `);

        await queryRunner.query(`
            INSERT INTO "stored_file" ("tenantId","ownerType","ownerId","role","provider","providerRef","mimeType")
            SELECT "tenantId", 'contract', "id"::text, 'signed_pdf', 'base64_postgres', "signedPdfBase64", 'application/pdf'
            FROM "contract" WHERE "signedPdfBase64" IS NOT NULL AND "signedPdfBase64" <> ''
        `);

        await queryRunner.query(`
            INSERT INTO "stored_file" ("tenantId","ownerType","ownerId","role","provider","providerRef","url","mimeType")
            SELECT "tenantId", 'contract', "id"::text, 'signed_pdf', 'cloudinary', 'signed_' || "id"::text, "signedPdfUrl", 'application/pdf'
            FROM "contract" WHERE "signedPdfUrl" IS NOT NULL AND "signedPdfUrl" <> ''
        `);

        await queryRunner.query(`
            INSERT INTO "stored_file" ("tenantId","ownerType","ownerId","role","provider","providerRef","mimeType")
            SELECT "tenantId", 'contract', "id"::text, 'signature', 'base64_postgres', "signatureBase64", 'image/png'
            FROM "contract" WHERE "signatureBase64" IS NOT NULL AND "signatureBase64" <> ''
        `);

        await queryRunner.query(`
            INSERT INTO "stored_file" ("tenantId","ownerType","ownerId","role","provider","providerRef","mimeType")
            SELECT "tenantId", 'contract', "id"::text, 'selfie', 'base64_postgres', "selfieBase64", 'image/jpeg'
            FROM "contract" WHERE "selfieBase64" IS NOT NULL AND "selfieBase64" <> ''
        `);

        await queryRunner.query(`
            INSERT INTO "stored_file" ("tenantId","ownerType","ownerId","role","provider","providerRef","mimeType")
            SELECT "tenantId", 'contract', "id"::text, 'ine_front', 'base64_postgres', "ineFrontBase64", 'image/jpeg'
            FROM "contract" WHERE "ineFrontBase64" IS NOT NULL AND "ineFrontBase64" <> ''
        `);

        await queryRunner.query(`
            INSERT INTO "stored_file" ("tenantId","ownerType","ownerId","role","provider","providerRef","mimeType")
            SELECT "tenantId", 'contract', "id"::text, 'ine_back', 'base64_postgres', "ineBackBase64", 'image/jpeg'
            FROM "contract" WHERE "ineBackBase64" IS NOT NULL AND "ineBackBase64" <> ''
        `);

        await queryRunner.query(`ALTER TABLE "contract" DROP COLUMN "contractPdfBase64"`);
        await queryRunner.query(`ALTER TABLE "contract" DROP COLUMN "signedPdfBase64"`);
        await queryRunner.query(`ALTER TABLE "contract" DROP COLUMN "signedPdfUrl"`);
        await queryRunner.query(`ALTER TABLE "contract" DROP COLUMN "signatureBase64"`);
        await queryRunner.query(`ALTER TABLE "contract" DROP COLUMN "selfieBase64"`);
        await queryRunner.query(`ALTER TABLE "contract" DROP COLUMN "ineFrontBase64"`);
        await queryRunner.query(`ALTER TABLE "contract" DROP COLUMN "ineBackBase64"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "contract" ADD "contractPdfBase64" text`);
        await queryRunner.query(`ALTER TABLE "contract" ADD "signedPdfBase64" text`);
        await queryRunner.query(`ALTER TABLE "contract" ADD "signedPdfUrl" character varying`);
        await queryRunner.query(`ALTER TABLE "contract" ADD "signatureBase64" text`);
        await queryRunner.query(`ALTER TABLE "contract" ADD "selfieBase64" text`);
        await queryRunner.query(`ALTER TABLE "contract" ADD "ineFrontBase64" text`);
        await queryRunner.query(`ALTER TABLE "contract" ADD "ineBackBase64" text`);

        await queryRunner.query(`
            UPDATE "contract" c SET "contractPdfBase64" = sf."providerRef"
            FROM "stored_file" sf
            WHERE sf."ownerType" = 'contract' AND sf."ownerId" = c."id"::text AND sf."role" = 'contract_pdf' AND sf."provider" = 'base64_postgres'
        `);
        await queryRunner.query(`
            UPDATE "contract" c SET "signedPdfBase64" = sf."providerRef"
            FROM "stored_file" sf
            WHERE sf."ownerType" = 'contract' AND sf."ownerId" = c."id"::text AND sf."role" = 'signed_pdf' AND sf."provider" = 'base64_postgres'
        `);
        await queryRunner.query(`
            UPDATE "contract" c SET "signedPdfUrl" = sf."url"
            FROM "stored_file" sf
            WHERE sf."ownerType" = 'contract' AND sf."ownerId" = c."id"::text AND sf."role" = 'signed_pdf' AND sf."provider" = 'cloudinary'
        `);
        await queryRunner.query(`
            UPDATE "contract" c SET "signatureBase64" = sf."providerRef"
            FROM "stored_file" sf
            WHERE sf."ownerType" = 'contract' AND sf."ownerId" = c."id"::text AND sf."role" = 'signature'
        `);
        await queryRunner.query(`
            UPDATE "contract" c SET "selfieBase64" = sf."providerRef"
            FROM "stored_file" sf
            WHERE sf."ownerType" = 'contract' AND sf."ownerId" = c."id"::text AND sf."role" = 'selfie'
        `);
        await queryRunner.query(`
            UPDATE "contract" c SET "ineFrontBase64" = sf."providerRef"
            FROM "stored_file" sf
            WHERE sf."ownerType" = 'contract' AND sf."ownerId" = c."id"::text AND sf."role" = 'ine_front'
        `);
        await queryRunner.query(`
            UPDATE "contract" c SET "ineBackBase64" = sf."providerRef"
            FROM "stored_file" sf
            WHERE sf."ownerType" = 'contract' AND sf."ownerId" = c."id"::text AND sf."role" = 'ine_back'
        `);

        // No borra las filas de stored_file migradas (podrían compartir la tabla con otros
        // subsistemas para entonces) — quedan como huérfanas inofensivas, mismo criterio que
        // el resto de los down() de este proyecto (reversión de esquema, no limpieza total).
        await queryRunner.query(`DROP INDEX "IDX_stored_file_owner"`);
        await queryRunner.query(`DROP TABLE "stored_file"`);
    }

}

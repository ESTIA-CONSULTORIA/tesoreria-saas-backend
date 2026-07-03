import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1783075223674 implements MigrationInterface {
    name = 'InitialSchema1783075223674'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "tenant_settings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantId" character varying NOT NULL, "systemName" character varying, "logoUrl" character varying, "faviconUrl" character varying, "primaryColor" character varying, "secondaryColor" character varying, "accentColor" character varying, "fontFamily" character varying, "fontSize" integer, "sidebarBgColor" character varying, "sidebarTextColor" character varying, "sidebarActiveColor" character varying, "sidebarStyle" character varying, "primaryButtonColor" character varying, "secondaryButtonColor" character varying, "buttonBorderRadius" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_69225c0ca64bcbbf9af8a217043" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "insumo_alerts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantId" character varying NOT NULL, "companyId" character varying NOT NULL, "nombre" character varying NOT NULL, "tipo" character varying, "estado" character varying NOT NULL DEFAULT 'proximo', "notas" character varying, "reportadoPor" character varying, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a0fb15c35194907d54437580279" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "corte_fields" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantId" character varying NOT NULL, "key" character varying NOT NULL, "label" character varying NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "resta" boolean NOT NULL DEFAULT false, "isRequired" boolean NOT NULL DEFAULT false, "order" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_815b7e511bf1f6c93283d8be14d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "payroll_run" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantId" character varying NOT NULL, "companyId" character varying NOT NULL, "branchId" character varying NOT NULL, "periodStart" character varying NOT NULL, "periodEnd" character varying NOT NULL, "periodType" character varying NOT NULL DEFAULT 'QUINCENAL', "status" character varying NOT NULL DEFAULT 'PRENOMINA', "totalAmount" numeric(12,2) NOT NULL DEFAULT '0', "approvedBy" character varying, "approvedAt" TIMESTAMP, "paidFromBankId" character varying, "notes" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_12ecdd28188d0d7b14895be861a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "payroll_entry" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "payrollRunId" character varying NOT NULL, "employeeId" character varying NOT NULL, "tenantId" character varying NOT NULL, "workedDays" integer NOT NULL DEFAULT '0', "dailySalary" numeric(12,2) NOT NULL DEFAULT '0', "totalPerceptions" numeric(12,2) NOT NULL DEFAULT '0', "totalDeductions" numeric(12,2) NOT NULL DEFAULT '0', "netAmount" numeric(12,2) NOT NULL DEFAULT '0', "concepts" jsonb, "status" character varying NOT NULL DEFAULT 'PENDIENTE', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_3329186685dcfe2e5a2c6d5e3e9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "payroll_concept_template" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantId" character varying, "employeeId" character varying, "companyId" character varying, "isGlobal" boolean NOT NULL DEFAULT false, "name" character varying NOT NULL, "type" character varying NOT NULL, "defaultAmount" numeric(12,2) NOT NULL DEFAULT '0', "isActive" boolean NOT NULL DEFAULT true, "category" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_8808364bb80e5e1c8781b2da840" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "employee_incapacity" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantId" character varying NOT NULL, "employeeId" character varying NOT NULL, "startDate" character varying NOT NULL, "endDate" character varying NOT NULL, "days" integer NOT NULL DEFAULT '0', "type" character varying NOT NULL, "imssFileNumber" character varying, "diagnosis" character varying, "notes" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_e88797874efd6a6617763f9275d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "attendance_audit" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "attendanceId" character varying NOT NULL, "employeeId" character varying NOT NULL, "tenantId" character varying NOT NULL, "date" character varying NOT NULL, "previousStatus" character varying, "previousIncidenceType" character varying, "newStatus" character varying, "newIncidenceType" character varying, "changeReason" character varying, "approvedBy" character varying, "approvedAt" TIMESTAMP, "changedBy" character varying NOT NULL, "reverted" boolean NOT NULL DEFAULT false, "revertedBy" character varying, "revertedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_f684219cf6e9d1aa8b138ecb0a2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "contract" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantId" character varying NOT NULL, "companyId" character varying NOT NULL, "employeeId" character varying NOT NULL, "templateId" character varying NOT NULL, "fileType" character varying, "status" character varying NOT NULL, "signatureLevel" character varying NOT NULL, "contractPdfBase64" text, "signedPdfBase64" text, "signedPdfUrl" character varying, "signatureBase64" text, "selfieBase64" text, "ineFrontBase64" text, "ineBackBase64" text, "signedAt" TIMESTAMP, "signedIp" character varying, "signedLat" numeric(10,6), "signedLng" numeric(10,6), "faceMatchScore" integer, "notes" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_17c3a89f58a2997276084e706e8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "contract_template" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantId" character varying NOT NULL, "companyId" character varying, "name" character varying NOT NULL, "fileType" character varying NOT NULL, "fileBase64" text NOT NULL, "detectedFields" jsonb, "contractType" character varying DEFAULT 'INDETERMINADO', "employeeLevel" character varying DEFAULT 'OPERATIVO', "isActive" boolean NOT NULL DEFAULT true, "isGlobal" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_4bd19cbbc18731c95e0fe5004bb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "tenant" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "tenant_setting" ADD "splashBg" character varying`);
        await queryRunner.query(`ALTER TABLE "tenant_setting" ADD "theme" character varying NOT NULL DEFAULT 'dark'`);
        await queryRunner.query(`ALTER TABLE "tenant_setting" ADD "companyDisplayName" character varying`);
        await queryRunner.query(`ALTER TABLE "purchase" ADD "companyId" character varying`);
        await queryRunner.query(`ALTER TABLE "hr_document" ADD "ocrExtracted" jsonb`);
        await queryRunner.query(`ALTER TABLE "hr_document" ADD "ocrConfirmed" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "employee" ADD "domicilio" character varying`);
        await queryRunner.query(`ALTER TABLE "employee" ADD "colonia" character varying`);
        await queryRunner.query(`ALTER TABLE "employee" ADD "ciudad" character varying`);
        await queryRunner.query(`ALTER TABLE "employee" ADD "estado" character varying`);
        await queryRunner.query(`ALTER TABLE "employee" ADD "codigoPostal" character varying`);
        await queryRunner.query(`ALTER TABLE "employee" ADD "numeroIne" character varying`);
        await queryRunner.query(`ALTER TABLE "employee" ADD "fechaNacimiento" date`);
        await queryRunner.query(`ALTER TABLE "employee" ADD "genero" character varying`);
        await queryRunner.query(`ALTER TABLE "employee" ADD "tipoJornada" character varying`);
        await queryRunner.query(`ALTER TABLE "employee" ADD "tipoContrato" character varying`);
        await queryRunner.query(`ALTER TABLE "employee" ADD "tipoSalario" character varying`);
        await queryRunner.query(`ALTER TABLE "employee" ADD "salarioDiarioIntegrado" numeric DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "employee" ADD "claveRiesgoTrabajo" character varying`);
        await queryRunner.query(`ALTER TABLE "employee" ADD "imssNumber" character varying`);
        await queryRunner.query(`ALTER TABLE "employee" ADD "banco" character varying`);
        await queryRunner.query(`ALTER TABLE "employee" ADD "clabe" character varying`);
        await queryRunner.query(`ALTER TABLE "employee" ADD "periodoPago" character varying`);
        await queryRunner.query(`ALTER TABLE "attendance" ADD "incidenceType" character varying`);
        await queryRunner.query(`ALTER TABLE "attendance" ADD "overtimeHours" numeric(5,2)`);
        await queryRunner.query(`ALTER TABLE "attendance" ADD "incidenceNote" character varying`);
        await queryRunner.query(`ALTER TABLE "recipe" ALTER COLUMN "margenDeseado" SET DEFAULT '0.35'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "recipe" ALTER COLUMN "margenDeseado" SET DEFAULT 0.35`);
        await queryRunner.query(`ALTER TABLE "attendance" DROP COLUMN "incidenceNote"`);
        await queryRunner.query(`ALTER TABLE "attendance" DROP COLUMN "overtimeHours"`);
        await queryRunner.query(`ALTER TABLE "attendance" DROP COLUMN "incidenceType"`);
        await queryRunner.query(`ALTER TABLE "employee" DROP COLUMN "periodoPago"`);
        await queryRunner.query(`ALTER TABLE "employee" DROP COLUMN "clabe"`);
        await queryRunner.query(`ALTER TABLE "employee" DROP COLUMN "banco"`);
        await queryRunner.query(`ALTER TABLE "employee" DROP COLUMN "imssNumber"`);
        await queryRunner.query(`ALTER TABLE "employee" DROP COLUMN "claveRiesgoTrabajo"`);
        await queryRunner.query(`ALTER TABLE "employee" DROP COLUMN "salarioDiarioIntegrado"`);
        await queryRunner.query(`ALTER TABLE "employee" DROP COLUMN "tipoSalario"`);
        await queryRunner.query(`ALTER TABLE "employee" DROP COLUMN "tipoContrato"`);
        await queryRunner.query(`ALTER TABLE "employee" DROP COLUMN "tipoJornada"`);
        await queryRunner.query(`ALTER TABLE "employee" DROP COLUMN "genero"`);
        await queryRunner.query(`ALTER TABLE "employee" DROP COLUMN "fechaNacimiento"`);
        await queryRunner.query(`ALTER TABLE "employee" DROP COLUMN "numeroIne"`);
        await queryRunner.query(`ALTER TABLE "employee" DROP COLUMN "codigoPostal"`);
        await queryRunner.query(`ALTER TABLE "employee" DROP COLUMN "estado"`);
        await queryRunner.query(`ALTER TABLE "employee" DROP COLUMN "ciudad"`);
        await queryRunner.query(`ALTER TABLE "employee" DROP COLUMN "colonia"`);
        await queryRunner.query(`ALTER TABLE "employee" DROP COLUMN "domicilio"`);
        await queryRunner.query(`ALTER TABLE "hr_document" DROP COLUMN "ocrConfirmed"`);
        await queryRunner.query(`ALTER TABLE "hr_document" DROP COLUMN "ocrExtracted"`);
        await queryRunner.query(`ALTER TABLE "purchase" DROP COLUMN "companyId"`);
        await queryRunner.query(`ALTER TABLE "tenant_setting" DROP COLUMN "companyDisplayName"`);
        await queryRunner.query(`ALTER TABLE "tenant_setting" DROP COLUMN "theme"`);
        await queryRunner.query(`ALTER TABLE "tenant_setting" DROP COLUMN "splashBg"`);
        await queryRunner.query(`ALTER TABLE "tenant" DROP COLUMN "createdAt"`);
        await queryRunner.query(`DROP TABLE "contract_template"`);
        await queryRunner.query(`DROP TABLE "contract"`);
        await queryRunner.query(`DROP TABLE "attendance_audit"`);
        await queryRunner.query(`DROP TABLE "employee_incapacity"`);
        await queryRunner.query(`DROP TABLE "payroll_concept_template"`);
        await queryRunner.query(`DROP TABLE "payroll_entry"`);
        await queryRunner.query(`DROP TABLE "payroll_run"`);
        await queryRunner.query(`DROP TABLE "corte_fields"`);
        await queryRunner.query(`DROP TABLE "insumo_alerts"`);
        await queryRunner.query(`DROP TABLE "tenant_settings"`);
    }

}

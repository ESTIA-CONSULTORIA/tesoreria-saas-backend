import { MigrationInterface, QueryRunner } from "typeorm";

// Membresías (gimnasio): 4 tablas nuevas. El SQL revisado y corrido en producción vive en membresias-migration.sql (raíz del
// backend); esto es el mismo contenido para `migration:run` en bases nuevas. Idempotente (IF NOT EXISTS).
export class CreateMembresias1789300000000 implements MigrationInterface {
    name = 'CreateMembresias1789300000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "socios" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantId" character varying NOT NULL, "branchId" character varying, "numeroSocio" character varying(30) NOT NULL, "nombre" character varying NOT NULL, "apellidos" character varying, "telefono" character varying(30), "email" character varying, "fechaNacimiento" date, "nipHash" character varying(64), "estado" character varying(10) NOT NULL DEFAULT 'ACTIVO', "notas" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_socios" PRIMARY KEY ("id"), CONSTRAINT "CHK_socios_estado" CHECK ("estado" IN ('ACTIVO','BAJA')))`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_socios_tenant_numero" ON "socios" ("tenantId", "numeroSocio")`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_socios_tenant_nip" ON "socios" ("tenantId", "nipHash") WHERE "nipHash" IS NOT NULL`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_socios_tenant_estado" ON "socios" ("tenantId", "estado")`);

        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "planes_membresia" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantId" character varying NOT NULL, "nombre" character varying NOT NULL, "descripcion" text, "precio" numeric(10,2) NOT NULL, "periodoTipo" character varying(6) NOT NULL, "periodoCantidad" integer NOT NULL, "tasaIva" character varying(10), "diasCongelacionMax" integer NOT NULL DEFAULT 0, "beneficios" jsonb NOT NULL DEFAULT '{}'::jsonb, "productId" character varying, "activo" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_planes_membresia" PRIMARY KEY ("id"), CONSTRAINT "CHK_planes_membresia_precio" CHECK ("precio" >= 0), CONSTRAINT "CHK_planes_membresia_periodoTipo" CHECK ("periodoTipo" IN ('DIAS','MESES','ANOS')), CONSTRAINT "CHK_planes_membresia_periodoCantidad" CHECK ("periodoCantidad" > 0), CONSTRAINT "CHK_planes_membresia_tasaIva" CHECK ("tasaIva" IS NULL OR "tasaIva" IN ('16','8','0','EXENTO')), CONSTRAINT "CHK_planes_membresia_congelacion" CHECK ("diasCongelacionMax" >= 0))`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_planes_membresia_tenant_nombre" ON "planes_membresia" ("tenantId", "nombre")`);

        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "membresias" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantId" character varying NOT NULL, "socioId" uuid NOT NULL, "planId" uuid, "planNombre" character varying NOT NULL, "precioPagado" numeric(10,2) NOT NULL DEFAULT 0, "fechaInicio" date NOT NULL, "fechaFin" date NOT NULL, "estado" character varying(10) NOT NULL DEFAULT 'ACTIVA', "congeladaDesde" date, "diasCongelados" integer NOT NULL DEFAULT 0, "ventaId" character varying, "folioVenta" character varying, "notas" text, "createdBy" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_membresias" PRIMARY KEY ("id"), CONSTRAINT "CHK_membresias_estado" CHECK ("estado" IN ('ACTIVA','CONGELADA','CANCELADA')), CONSTRAINT "CHK_membresias_fechas" CHECK ("fechaFin" >= "fechaInicio"), CONSTRAINT "CHK_membresias_congelados" CHECK ("diasCongelados" >= 0), CONSTRAINT "FK_membresias_socio" FOREIGN KEY ("socioId") REFERENCES "socios" ("id") ON DELETE RESTRICT, CONSTRAINT "FK_membresias_plan" FOREIGN KEY ("planId") REFERENCES "planes_membresia" ("id") ON DELETE SET NULL)`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_membresias_tenant_socio" ON "membresias" ("tenantId", "socioId", "fechaFin")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_membresias_tenant_estado_fin" ON "membresias" ("tenantId", "estado", "fechaFin")`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_membresias_tenant_venta" ON "membresias" ("tenantId", "ventaId") WHERE "ventaId" IS NOT NULL`);

        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "checkins_socios" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantId" character varying NOT NULL, "socioId" uuid NOT NULL, "branchId" character varying, "membresiaId" uuid, "fechaHora" TIMESTAMP NOT NULL DEFAULT now(), "metodo" character varying(10) NOT NULL, "resultado" character varying(10) NOT NULL, "motivo" character varying, "registradoPor" character varying, CONSTRAINT "PK_checkins_socios" PRIMARY KEY ("id"), CONSTRAINT "CHK_checkins_metodo" CHECK ("metodo" IN ('NUMERO','NIP','MANUAL')), CONSTRAINT "CHK_checkins_resultado" CHECK ("resultado" IN ('PERMITIDO','DENEGADO')), CONSTRAINT "FK_checkins_socio" FOREIGN KEY ("socioId") REFERENCES "socios" ("id") ON DELETE RESTRICT)`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_checkins_tenant_fecha" ON "checkins_socios" ("tenantId", "fechaHora")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_checkins_tenant_socio_fecha" ON "checkins_socios" ("tenantId", "socioId", "fechaHora")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "checkins_socios"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "membresias"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "planes_membresia"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "socios"`);
    }

}

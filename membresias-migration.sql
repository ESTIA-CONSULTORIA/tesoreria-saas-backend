-- Membresías (gimnasio) — 4 tablas nuevas. SIN EJECUTAR. Idempotente (IF NOT EXISTS). Termina en ROLLBACK: revisa los SELECT y
-- cambia a COMMIT. No toca ninguna tabla existente (ni `sale` ni `product`): las ventas se ligan por membresias."ventaId".
--
--   Tablas: socios · planes_membresia · membresias · checkins_socios
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f membresias-migration.sql
-- Se corre ANTES de desplegar el código de membresías (si no, los endpoints de membresías dan 500; el resto del sistema no se
-- afecta). Convención del repo: columnas camelCase entre comillas, ids uuid (uuid_generate_v4), vigencias como `date`.
BEGIN;

-- ── 1. socios: la persona que paga la membresía (NO es Patient: ese es del módulo médico) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS "socios" (
  "id"              uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenantId"        character varying NOT NULL,
  "branchId"        character varying,
  "numeroSocio"     character varying(30) NOT NULL,
  "nombre"          character varying NOT NULL,
  "apellidos"       character varying,
  "telefono"        character varying(30),
  "email"           character varying,
  "fechaNacimiento" date,
  -- NIP del socio para el check-in: HMAC con llave del servidor (no bcrypt: así se busca por igualdad y es único por negocio).
  "nipHash"         character varying(64),
  "estado"          character varying(10) NOT NULL DEFAULT 'ACTIVO',
  "notas"           text,
  "createdAt"       TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "PK_socios" PRIMARY KEY ("id"),
  CONSTRAINT "CHK_socios_estado" CHECK ("estado" IN ('ACTIVO','BAJA'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_socios_tenant_numero" ON "socios" ("tenantId", "numeroSocio");
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_socios_tenant_nip" ON "socios" ("tenantId", "nipHash") WHERE "nipHash" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "IDX_socios_tenant_estado" ON "socios" ("tenantId", "estado");

-- ── 2. planes_membresia: lo que el cliente configura (nombre, precio, periodo, beneficios) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS "planes_membresia" (
  "id"                  uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenantId"            character varying NOT NULL,
  "nombre"              character varying NOT NULL,
  "descripcion"         text,
  -- Precio como el negocio captura sus precios: sin IVA o con IVA incluido según su configuración (preciosIncluyenIva).
  "precio"              numeric(10,2) NOT NULL,
  "periodoTipo"         character varying(6) NOT NULL,
  "periodoCantidad"     integer NOT NULL,
  -- NULL = usa el IVA por defecto del negocio.
  "tasaIva"             character varying(10),
  "diasCongelacionMax"  integer NOT NULL DEFAULT 0,
  -- { descuentoPct?: number, notas?: string[] } — el descuento se aplica en el POS con los mismos topes por rol.
  "beneficios"          jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Producto del POS que representa este plan (servicio, sin inventario): así el cobro, el IVA y el corte son los del POS.
  "productId"           character varying,
  "activo"              boolean NOT NULL DEFAULT true,
  "createdAt"           TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt"           TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "PK_planes_membresia" PRIMARY KEY ("id"),
  CONSTRAINT "CHK_planes_membresia_precio" CHECK ("precio" >= 0),
  CONSTRAINT "CHK_planes_membresia_periodoTipo" CHECK ("periodoTipo" IN ('DIAS','MESES','ANOS')),
  CONSTRAINT "CHK_planes_membresia_periodoCantidad" CHECK ("periodoCantidad" > 0),
  CONSTRAINT "CHK_planes_membresia_tasaIva" CHECK ("tasaIva" IS NULL OR "tasaIva" IN ('16','8','0','EXENTO')),
  CONSTRAINT "CHK_planes_membresia_congelacion" CHECK ("diasCongelacionMax" >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_planes_membresia_tenant_nombre" ON "planes_membresia" ("tenantId", "nombre");

-- ── 3. membresias: un periodo pagado de un socio (cada cobro o renovación crea una fila; el historial se conserva) ───────────
CREATE TABLE IF NOT EXISTS "membresias" (
  "id"              uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenantId"        character varying NOT NULL,
  "socioId"         uuid NOT NULL,
  "planId"          uuid,
  "planNombre"      character varying NOT NULL,
  "precioPagado"    numeric(10,2) NOT NULL DEFAULT 0,
  "fechaInicio"     date NOT NULL,
  "fechaFin"        date NOT NULL,
  -- VENCIDA no se guarda: es ACTIVA con fechaFin anterior a hoy (se calcula, sin tareas programadas).
  "estado"          character varying(10) NOT NULL DEFAULT 'ACTIVA',
  "congeladaDesde"  date,
  "diasCongelados"  integer NOT NULL DEFAULT 0,
  "ventaId"         character varying,
  "folioVenta"      character varying,
  "notas"           text,
  "createdBy"       character varying,
  "createdAt"       TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "PK_membresias" PRIMARY KEY ("id"),
  CONSTRAINT "CHK_membresias_estado" CHECK ("estado" IN ('ACTIVA','CONGELADA','CANCELADA')),
  CONSTRAINT "CHK_membresias_fechas" CHECK ("fechaFin" >= "fechaInicio"),
  CONSTRAINT "CHK_membresias_congelados" CHECK ("diasCongelados" >= 0),
  CONSTRAINT "FK_membresias_socio" FOREIGN KEY ("socioId") REFERENCES "socios" ("id") ON DELETE RESTRICT,
  CONSTRAINT "FK_membresias_plan" FOREIGN KEY ("planId") REFERENCES "planes_membresia" ("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "IDX_membresias_tenant_socio" ON "membresias" ("tenantId", "socioId", "fechaFin");
CREATE INDEX IF NOT EXISTS "IDX_membresias_tenant_estado_fin" ON "membresias" ("tenantId", "estado", "fechaFin");
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_membresias_tenant_venta" ON "membresias" ("tenantId", "ventaId") WHERE "ventaId" IS NOT NULL;

-- ── 4. checkins_socios: cada entrada (permitida o denegada, con el motivo) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "checkins_socios" (
  "id"            uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenantId"      character varying NOT NULL,
  "socioId"       uuid NOT NULL,
  "branchId"      character varying,
  "membresiaId"   uuid,
  "fechaHora"     TIMESTAMP NOT NULL DEFAULT now(),
  "metodo"        character varying(10) NOT NULL,
  "resultado"     character varying(10) NOT NULL,
  "motivo"        character varying,
  "registradoPor" character varying,
  CONSTRAINT "PK_checkins_socios" PRIMARY KEY ("id"),
  CONSTRAINT "CHK_checkins_metodo" CHECK ("metodo" IN ('NUMERO','NIP','MANUAL')),
  CONSTRAINT "CHK_checkins_resultado" CHECK ("resultado" IN ('PERMITIDO','DENEGADO')),
  CONSTRAINT "FK_checkins_socio" FOREIGN KEY ("socioId") REFERENCES "socios" ("id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "IDX_checkins_tenant_fecha" ON "checkins_socios" ("tenantId", "fechaHora");
CREATE INDEX IF NOT EXISTS "IDX_checkins_tenant_socio_fecha" ON "checkins_socios" ("tenantId", "socioId", "fechaHora");

-- Constancia en la tabla de migraciones de TypeORM para que `migration:run` no la repita.
INSERT INTO "migrations" ("timestamp", "name")
SELECT 1789300000000, 'CreateMembresias1789300000000'
WHERE NOT EXISTS (SELECT 1 FROM "migrations" WHERE "name" = 'CreateMembresias1789300000000');

-- ── Verificación ──────────────────────────────────────────────────────────────────────────────────────────────────────────
SELECT table_name FROM information_schema.tables
 WHERE table_name IN ('socios','planes_membresia','membresias','checkins_socios') ORDER BY table_name;   -- 4 filas
SELECT table_name, count(*) AS columnas FROM information_schema.columns
 WHERE table_name IN ('socios','planes_membresia','membresias','checkins_socios') GROUP BY table_name ORDER BY table_name;
SELECT conname, conrelid::regclass AS tabla FROM pg_constraint
 WHERE conrelid::regclass::text IN ('socios','planes_membresia','membresias','checkins_socios') ORDER BY 2, 1;

ROLLBACK;  -- cambia a COMMIT; tras revisar

-- Reversa (si hiciera falta; las tablas son nuevas, no hay datos de otro módulo que perder):
--   DROP TABLE IF EXISTS "checkins_socios"; DROP TABLE IF EXISTS "membresias";
--   DROP TABLE IF EXISTS "planes_membresia"; DROP TABLE IF EXISTS "socios";
--   DELETE FROM "migrations" WHERE "name" = 'CreateMembresias1789300000000';

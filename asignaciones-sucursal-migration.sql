-- Asignaciones de sucursal por usuario (rol por sucursal) — FASE 2, DISEÑO. SIN EJECUTAR. Idempotente. Termina en ROLLBACK.
-- No se corre hasta que el diseño (DISENO-ASIGNACIONES-SUCURSAL.md) tenga visto bueno. Aditivo: no cambia ni borra nada existente.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f asignaciones-sucursal-migration.sql
--
-- Paso 0 (leer antes de correr): confirmar los tipos reales de las llaves que se referencian.
--   SELECT table_name, column_name, data_type FROM information_schema.columns
--    WHERE (table_name, column_name) IN (('user','id'),('branch','id'),('role','id'),('user','tenantId'),('sale','id'),('shift','id'));
-- Si "role"."id" o alguna otra no es uuid, ajusta el tipo de la columna correspondiente de la tabla nueva ANTES de correr.
BEGIN;

-- ── 1. asignaciones ──────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "usuario_sucursal_asignaciones" (
  "id"            uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenantId"      character varying NOT NULL,
  "userId"        uuid NOT NULL,
  "branchId"      uuid NOT NULL,
  "roleId"        uuid NOT NULL,                 -- rol del usuario EN esa sucursal (no sube ni baja el rol base en otras)
  "vigenteDesde"  TIMESTAMP,                     -- NULL = desde ya
  "vigenteHasta"  TIMESTAMP,                     -- NULL = sin vencimiento; se evalúa en CADA petición, no en el login
  "motivo"        text NOT NULL,
  "otorgadoPor"   uuid NOT NULL,                 -- quién la dio (auditoría; nunca el propio beneficiario)
  "revocadaAt"    TIMESTAMP,                     -- revocar = marcar, no borrar (el historial de ventas la referencia)
  "revocadaPor"   uuid,
  "createdAt"     TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "PK_usuario_sucursal_asignaciones" PRIMARY KEY ("id"),
  CONSTRAINT "CHK_usa_vigencia" CHECK ("vigenteHasta" IS NULL OR "vigenteDesde" IS NULL OR "vigenteHasta" > "vigenteDesde"),
  CONSTRAINT "CHK_usa_motivo" CHECK (length(btrim("motivo")) >= 3),
  CONSTRAINT "CHK_usa_no_autootorgada" CHECK ("otorgadoPor" <> "userId"),
  CONSTRAINT "CHK_usa_revocacion" CHECK (("revocadaAt" IS NULL AND "revocadaPor" IS NULL) OR ("revocadaAt" IS NOT NULL AND "revocadaPor" IS NOT NULL)),
  CONSTRAINT "FK_usa_user"   FOREIGN KEY ("userId")  REFERENCES "user" ("id")   ON DELETE RESTRICT,
  CONSTRAINT "FK_usa_branch" FOREIGN KEY ("branchId") REFERENCES "branch" ("id") ON DELETE RESTRICT,
  CONSTRAINT "FK_usa_role"   FOREIGN KEY ("roleId")  REFERENCES "role" ("id")   ON DELETE RESTRICT
);
-- Una asignación viva por (usuario, sucursal); para cambiarla se revoca y se crea otra (queda historial).
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_usa_user_branch_viva" ON "usuario_sucursal_asignaciones" ("userId", "branchId") WHERE "revocadaAt" IS NULL;
CREATE INDEX IF NOT EXISTS "IDX_usa_tenant_user"   ON "usuario_sucursal_asignaciones" ("tenantId", "userId") WHERE "revocadaAt" IS NULL;
CREATE INDEX IF NOT EXISTS "IDX_usa_tenant_branch" ON "usuario_sucursal_asignaciones" ("tenantId", "branchId") WHERE "revocadaAt" IS NULL;

-- ── 2. auditoría de sucursal y rol efectivos en lo que mueve dinero ────────────────────────────────────────────────────────
-- Nullable: lo histórico queda NULL (= rol/sucursal base). Se llenan desde el servidor, nunca desde el cliente.
ALTER TABLE "sale"  ADD COLUMN IF NOT EXISTS "rolEfectivo"            character varying(30);
ALTER TABLE "sale"  ADD COLUMN IF NOT EXISTS "asignacionId"           uuid;
ALTER TABLE "sale"  ADD COLUMN IF NOT EXISTS "devolucionRolEfectivo"  character varying(30);
ALTER TABLE "sale"  ADD COLUMN IF NOT EXISTS "devolucionAsignacionId" uuid;
ALTER TABLE "shift" ADD COLUMN IF NOT EXISTS "rolEfectivo"            character varying(30);
ALTER TABLE "shift" ADD COLUMN IF NOT EXISTS "asignacionId"           uuid;

-- ── 3. un turno abierto por usuario ────────────────────────────────────────────────────────────────────────────────────────
-- ANTES de crear el índice hay que revisar duplicados existentes (si hay, el CREATE falla y el SQL entero hace ROLLBACK):
--   SELECT "tenantId", cajero, count(*) FROM "shift" WHERE status = 'ABIERTO' GROUP BY 1,2 HAVING count(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_shift_un_abierto_por_cajero" ON "shift" ("tenantId", "cajero") WHERE "status" = 'ABIERTO';

INSERT INTO "migrations" ("timestamp", "name")
SELECT 1789400000000, 'CreateAsignacionesSucursal1789400000000'
WHERE NOT EXISTS (SELECT 1 FROM "migrations" WHERE "name" = 'CreateAsignacionesSucursal1789400000000');

-- ── Verificación ──────────────────────────────────────────────────────────────────────────────────────────────────────────
SELECT table_name FROM information_schema.tables WHERE table_name = 'usuario_sucursal_asignaciones';
SELECT table_name, column_name FROM information_schema.columns
 WHERE column_name IN ('rolEfectivo','asignacionId','devolucionRolEfectivo','devolucionAsignacionId') AND table_name IN ('sale','shift') ORDER BY 1,2;
SELECT indexname FROM pg_indexes WHERE indexname IN ('UQ_usa_user_branch_viva','IDX_usa_tenant_user','IDX_usa_tenant_branch','UQ_shift_un_abierto_por_cajero');

ROLLBACK;  -- cambia a COMMIT tras revisar

-- Reversa:
--   DROP INDEX IF EXISTS "UQ_shift_un_abierto_por_cajero";
--   ALTER TABLE "shift" DROP COLUMN IF EXISTS "asignacionId", DROP COLUMN IF EXISTS "rolEfectivo";
--   ALTER TABLE "sale" DROP COLUMN IF EXISTS "devolucionAsignacionId", DROP COLUMN IF EXISTS "devolucionRolEfectivo",
--     DROP COLUMN IF EXISTS "asignacionId", DROP COLUMN IF EXISTS "rolEfectivo";
--   DROP TABLE IF EXISTS "usuario_sucursal_asignaciones";
--   DELETE FROM "migrations" WHERE "name" = 'CreateAsignacionesSucursal1789400000000';

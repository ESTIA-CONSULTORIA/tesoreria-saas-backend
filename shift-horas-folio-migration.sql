-- POS: horas reales del turno (abiertoEn, cerradoEn en timestamptz) y folio corto por tenant (T-0001). SIN EJECUTAR. Idempotente.
-- Termina en ROLLBACK: revisa los SELECT y cambia a COMMIT.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f shift-horas-folio-migration.sql
--
-- Correrlo ANTES de desplegar el código: solo AGREGA columnas nulas, una tabla de contadores y un índice; no borra ni cambia ninguna
-- columna existente (horaApertura, horaCierre y fecha se conservan tal cual). El código viejo sigue funcionando con las columnas nuevas.
--
-- Por qué: horaApertura/horaCierre son `time` sin fecha y sin zona, guardadas en UTC (hora del servidor). Un turno que cruza la medianoche
-- UTC (todo lo que abre después de las 17:00 de Tijuana) queda con cierre < apertura. abiertoEn/cerradoEn guardan el instante real.
--
-- Relleno de los turnos existentes (solo donde la columna nueva es NULL, así que repetirlo no cambia nada):
--   abiertoEn : turno normal  = fecha + horaApertura interpretadas como UTC (así se guardaron); retroactivo = createdAt (la fecha elegida es de negocio).
--   cerradoEn : turno normal  = fecha + horaCierre en UTC, y si resulta anterior a abiertoEn es que cruzó la medianoche UTC: se suma 1 día;
--               retroactivo   = createdAt. Turno abierto: NULL.
--   folio     : por tenant, en orden de createdAt (desempate por id): T-0001, T-0002… ; el contador queda en el último número.
BEGIN;

ALTER TABLE "shift" ADD COLUMN IF NOT EXISTS "abiertoEn" TIMESTAMPTZ;
ALTER TABLE "shift" ADD COLUMN IF NOT EXISTS "cerradoEn" TIMESTAMPTZ;
ALTER TABLE "shift" ADD COLUMN IF NOT EXISTS "folio" VARCHAR(16);

CREATE TABLE IF NOT EXISTS "shift_folio_contador" (
  "tenantId" character varying(64) NOT NULL,
  "ultimo" integer NOT NULL DEFAULT 0,
  CONSTRAINT "PK_shift_folio_contador" PRIMARY KEY ("tenantId")
);

-- abiertoEn
UPDATE "shift"
   SET "abiertoEn" = CASE WHEN "esRetroactivo" THEN "createdAt" AT TIME ZONE 'UTC'
                          ELSE ("fecha"::timestamp + "horaApertura") AT TIME ZONE 'UTC' END
 WHERE "abiertoEn" IS NULL;

-- cerradoEn (solo turnos cerrados)
UPDATE "shift"
   SET "cerradoEn" = CASE
         WHEN "esRetroactivo" THEN "createdAt" AT TIME ZONE 'UTC'
         WHEN ("fecha"::timestamp + "horaCierre") AT TIME ZONE 'UTC' < "abiertoEn" THEN (("fecha"::timestamp + "horaCierre") + INTERVAL '1 day') AT TIME ZONE 'UTC'
         ELSE ("fecha"::timestamp + "horaCierre") AT TIME ZONE 'UTC' END
 WHERE "cerradoEn" IS NULL AND "status" = 'CERRADO' AND ("horaCierre" IS NOT NULL OR "esRetroactivo");

-- folio por tenant (continúa después del mayor ya asignado, si lo hay)
WITH base AS (
  SELECT "tenantId", MAX(NULLIF(regexp_replace("folio", '\D', '', 'g'), '')::int) AS mx
    FROM "shift" WHERE "folio" IS NOT NULL AND "tenantId" IS NOT NULL GROUP BY "tenantId"
), orden AS (
  SELECT s."id", s."tenantId", ROW_NUMBER() OVER (PARTITION BY s."tenantId" ORDER BY s."createdAt", s."id") AS rn
    FROM "shift" s WHERE s."folio" IS NULL AND s."tenantId" IS NOT NULL
)
UPDATE "shift" s
   SET "folio" = 'T-' || CASE WHEN COALESCE(b.mx, 0) + o.rn < 10000 THEN lpad((COALESCE(b.mx, 0) + o.rn)::text, 4, '0') ELSE (COALESCE(b.mx, 0) + o.rn)::text END
  FROM "orden" o LEFT JOIN "base" b ON b."tenantId" = o."tenantId"
 WHERE s."id" = o."id";

-- contador = mayor folio por tenant (nunca baja)
INSERT INTO "shift_folio_contador" ("tenantId", "ultimo")
SELECT "tenantId", MAX(regexp_replace("folio", '\D', '', 'g')::int)
  FROM "shift" WHERE "folio" IS NOT NULL AND "tenantId" IS NOT NULL GROUP BY "tenantId"
ON CONFLICT ("tenantId") DO UPDATE SET "ultimo" = GREATEST("shift_folio_contador"."ultimo", EXCLUDED."ultimo");

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_shift_tenant_folio" ON "shift" ("tenantId", "folio") WHERE "folio" IS NOT NULL;

-- Verificación (revisa antes de cambiar a COMMIT)
SELECT count(*) AS turnos,
       count("abiertoEn") AS con_abiertoEn,
       count(*) FILTER (WHERE "status" = 'CERRADO') AS cerrados,
       count("cerradoEn") AS con_cerradoEn,
       count(*) FILTER (WHERE "cerradoEn" < "abiertoEn") AS cierre_antes_que_apertura,
       count("folio") AS con_folio,
       count(DISTINCT ("tenantId", "folio")) AS folios_distintos,
       count(*) FILTER (WHERE abs(extract(epoch FROM ("abiertoEn" - "createdAt" AT TIME ZONE 'UTC'))) > 300 AND NOT "esRetroactivo") AS abre_difiere_de_createdAt_mas_5min
  FROM "shift";

ROLLBACK;

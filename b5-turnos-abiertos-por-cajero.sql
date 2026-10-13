-- B5 (ESTADO-SISTEMA) — un solo turno ABIERTO por cajero. NADA DE ESTE ARCHIVO SE HA EJECUTADO.
-- Orden: 1) y 2) son solo lectura (correr primero). 3) es el índice: solo puede crearse cuando 1) devuelve 0 filas.
-- Tabla `shift`: cajero = id del usuario, status 'ABIERTO' | 'CERRADO' (src/pos/entities/shift.entity.ts).

-- 1) CONTEO (solo lectura): cajeros con más de un turno abierto --------------------------------------------------------
SELECT s."tenantId",
       t."legalName"            AS tenant,
       s."cajero",
       u."name"                 AS nombre_cajero,
       COUNT(*)                 AS turnos_abiertos,
       MIN(s."fecha")           AS abierto_mas_antiguo,
       MAX(s."fecha")           AS abierto_mas_reciente
  FROM "shift" s
  LEFT JOIN "tenant" t ON t."id"::text = s."tenantId"::text
  LEFT JOIN "user"   u ON u."id"::text = s."cajero"::text
 WHERE s."status" = 'ABIERTO'
   AND s."cajero" IS NOT NULL
 GROUP BY s."tenantId", t."legalName", s."cajero", u."name"
HAVING COUNT(*) > 1
 ORDER BY turnos_abiertos DESC, abierto_mas_antiguo;

-- 2) DETALLE (solo lectura): los turnos abiertos de esos cajeros, para decidir cuál cerrar -----------------------------
SELECT s."id", s."tenantId", s."cajero", s."sucursalId", s."fecha", s."horaApertura", s."fondoInicial",
       s."totalVentas", s."esRetroactivo", s."createdAt"
  FROM "shift" s
 WHERE s."status" = 'ABIERTO'
   AND s."cajero" IS NOT NULL
   AND (s."tenantId", s."cajero") IN (
         SELECT "tenantId", "cajero" FROM "shift"
          WHERE "status" = 'ABIERTO' AND "cajero" IS NOT NULL
          GROUP BY "tenantId", "cajero" HAVING COUNT(*) > 1)
 ORDER BY s."tenantId", s."cajero", s."fecha", s."horaApertura";

-- 3) ÍNDICE ÚNICO (escribe el esquema; NO ejecutar hasta que 1) dé 0 filas) ---------------------------------------------
-- Parcial: solo restringe a los turnos ABIERTOS, los CERRADOS pueden repetirse sin límite.
-- CONCURRENTLY no puede ir dentro de una transacción; en Postgres, ejecutar tal cual (sin BEGIN).
-- Si hay filas duplicadas, la creación falla sin cambiar nada (no borra ni modifica turnos).
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "UQ_shift_un_abierto_por_cajero"
    ON "shift" ("tenantId", "cajero")
 WHERE "status" = 'ABIERTO' AND "cajero" IS NOT NULL;

-- Revertir (si hiciera falta):
-- DROP INDEX CONCURRENTLY IF EXISTS "UQ_shift_un_abierto_por_cajero";

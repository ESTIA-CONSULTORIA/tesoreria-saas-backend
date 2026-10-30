-- ESTADO: APLICADO en producción: la migración MigrateHrDocumentFilesToStoredFile1788400000000 consta en la tabla migrations (verificado en solo lectura el 2026-10-30; la fecha de aplicación no está registrada). Auditoría previa, solo lectura.
-- Archivado en docs/sql-archivo/. No volver a ejecutar sin revisar.

-- ============================================================================
-- Auditoría de solo lectura — pre-requisito para migrar HrDocument a StoredFile
-- (mismo protocolo que la migración de Contract, Frente 1 de Fase 3 storage).
--
-- RE-CORRIDA: la primera pasada (huérfanas: 0, tenant nulo: 0) fue antes de la
-- maratón de smoke tests de nómina de esta sesión — hubo varias rondas de
-- prueba contra producción real desde entonces. La mayoría de esos documentos
-- desechables ya se limpiaron vía API (DELETE /hr/documents/:id, verificado),
-- pero esta corrida confirma el estado real ANTES de tocar el esquema, no
-- asume que la limpieza fue perfecta. La sección 9 (nueva) busca cualquier
-- residuo de esas pruebas específicamente.
--
-- NO ESCRIBE NADA. Son puros SELECT. Seguro de correr contra producción tal cual.
--
-- Uso: este proyecto NO usa DATABASE_URL local (no existe esa variable en
-- .env) — usa variables sueltas DB_HOST/DB_PORT/DB_USER/DB_PASS/DB_NAME (ver
-- .env.example). Corre esto contra la MISMA base de producción de siempre
-- (la que resolviste vía DATABASE_URL de Railway — postgres.railway.internal /
-- thomas.proxy.rlwy.net:50132/railway, confirmado en esta sesión que es una
-- sola base física, dos rutas de red):
--
--   psql -h <host_produccion> -p <puerto> -U <usuario> -d <bd> -f hr-document-migration-audit.sql
-- ============================================================================

\timing on

-- 1) Panorama general: cuántas filas, cuántas tienen archivo y de qué tipo
--    (fileData = base64 en Postgres, url = Cloudinary). "con_ambos" debería
--    ser 0 según el código actual (nunca escribe los dos a la vez) — si sale
--    >0, hay que revisar ese caso aparte antes de migrar.
SELECT
  count(*)                                                                    AS total_hr_document,
  count(*) FILTER (WHERE "fileData" IS NOT NULL AND "fileData" <> '')         AS con_file_data,
  count(*) FILTER (WHERE "url" IS NOT NULL AND "url" <> '')                   AS con_url,
  count(*) FILTER (WHERE ("fileData" IS NULL OR "fileData" = '')
                     AND ("url" IS NULL OR "url" = ''))                       AS sin_archivo,
  count(*) FILTER (WHERE "fileData" IS NOT NULL AND "fileData" <> ''
                     AND "url" IS NOT NULL AND "url" <> '')                   AS con_ambos_ojo
FROM hr_document;

-- 2) Filas huérfanas: employeeId que ya no tiene match en employee. HrDocument
--    no tiene columna tenantId propia — la migración la resuelve vía JOIN a
--    employee.tenantId, así que estas filas no se pueden migrar sin decidir
--    manualmente qué hacer con ellas primero.
--    hr_document."employeeId" es varchar, employee.id es uuid — mismo mismatch
--    ya conocido en este proyecto (ver AddGiroToTenant, MigrateContractFiles...);
--    se castea el lado uuid con ::text, no al revés (comparar como uuid fallaría
--    para cualquier employeeId que no sea un uuid válido).
SELECT count(*) AS huerfanas_sin_employee
FROM hr_document hd
LEFT JOIN employee e ON e.id::text = hd."employeeId"
WHERE e.id IS NULL;

-- 2b) IDs de esas huérfanas (máx 50) por si hace falta inspeccionarlas a mano.
SELECT hd.id, hd."employeeId", hd.tipo, hd.nombre, hd."uploadedAt"
FROM hr_document hd
LEFT JOIN employee e ON e.id::text = hd."employeeId"
WHERE e.id IS NULL
ORDER BY hd."uploadedAt" DESC
LIMIT 50;

-- 3) Filas con employeeId válido PERO employee.tenantId nulo (la columna es
--    nullable en el entity) — estas tampoco se pueden migrar limpio sin
--    decidir un tenantId de respaldo.
SELECT count(*) AS con_employee_pero_tenant_null
FROM hr_document hd
JOIN employee e ON e.id::text = hd."employeeId"
WHERE e."tenantId" IS NULL
  AND (("fileData" IS NOT NULL AND "fileData" <> '') OR ("url" IS NOT NULL AND "url" <> ''));

-- 4) Tamaño total de fileData — para dimensionar cuánto crece stored_file.
SELECT
  pg_size_pretty(coalesce(sum(octet_length("fileData")), 0)::bigint)  AS tamano_total_filedata,
  coalesce(avg(octet_length("fileData")), 0)::bigint                  AS bytes_promedio,
  coalesce(max(octet_length("fileData")), 0)                          AS bytes_max
FROM hr_document
WHERE "fileData" IS NOT NULL AND "fileData" <> '';

-- 5) Desglose por tipo — confirma qué está migrando (INE/CURP/CONTRATO/
--    RECIBO_NOMINA/etc.) y el tamaño que aporta cada uno.
SELECT
  tipo,
  count(*)                                                              AS total,
  count(*) FILTER (WHERE "fileData" IS NOT NULL AND "fileData" <> '')   AS con_file_data,
  count(*) FILTER (WHERE "url" IS NOT NULL AND "url" <> '')             AS con_url,
  pg_size_pretty(coalesce(sum(octet_length("fileData")), 0)::bigint)    AS tamano_filedata
FROM hr_document
GROUP BY tipo
ORDER BY total DESC;

-- 6) Normalización del contenido de fileData: cuántas filas guardaron el
--    data-URI completo ("data:mime;base64,...") vs. base64 puro. Afecta cómo
--    la migración calcula/guarda mimeType en stored_file (con prefijo se
--    puede extraer el mime; sin él, hay que inferirlo del tipo de documento).
SELECT
  count(*) FILTER (WHERE "fileData" LIKE 'data:%')                                        AS con_prefijo_data_uri,
  count(*) FILTER (WHERE "fileData" IS NOT NULL AND "fileData" <> '' AND "fileData" NOT LIKE 'data:%') AS base64_puro
FROM hr_document;

-- 7) RECIBO_NOMINA específicamente, por tenant — para confirmar los datos
--    reales de la prueba de Nómina (Riova) que ya existen hoy. Dos JOINs, dos
--    mismatches de tipo (employee.id uuid vs hr_document.employeeId varchar;
--    tenant.id uuid vs employee.tenantId varchar) — mismo cast ::text en ambos.
SELECT
  e."tenantId",
  t."legalName",
  t."tradeName",
  count(*)                                                             AS recibos,
  pg_size_pretty(coalesce(sum(octet_length(hd."fileData")), 0)::bigint) AS tamano
FROM hr_document hd
JOIN employee e ON e.id::text = hd."employeeId"
LEFT JOIN tenant t ON t.id::text = e."tenantId"
WHERE hd.tipo = 'RECIBO_NOMINA'
GROUP BY e."tenantId", t."legalName", t."tradeName"
ORDER BY recibos DESC;

-- 7b) Diagnóstico del hallazgo "0 filas RECIBO_NOMINA": todo lo que SÍ hay bajo
-- ese tipo, sin filtrar por join (por si el 0 fuera real y no un problema de
-- conexión a la BD equivocada — ver nota de "Uso" arriba). Si esto también da
-- 0, confirma que la tabla nunca recibió esa fila en ESTA base específica.
SELECT id, "employeeId", nombre, "uploadedAt",
       ("fileData" IS NOT NULL AND "fileData" <> '') AS tiene_file_data,
       (url IS NOT NULL AND url <> '')                AS tiene_url
FROM hr_document
WHERE tipo = 'RECIBO_NOMINA'
ORDER BY "uploadedAt" DESC
LIMIT 20;

-- 7c) Y por si el tipo se guardó con otra variante de texto (espacio, minúsculas,
-- etc.) en vez de exactamente 'RECIBO_NOMINA' como escribe el código hoy.
SELECT DISTINCT tipo FROM hr_document WHERE tipo ILIKE '%recibo%' OR tipo ILIKE '%nomina%';

-- 8) Línea base de stored_file antes de tocar nada — para comparar conteos
--    después de correr la migración real.
SELECT count(*) AS total_stored_file_hoy FROM stored_file;
SELECT "ownerType", count(*) FROM stored_file GROUP BY "ownerType" ORDER BY 2 DESC;

-- 9) Residuos de las rondas de smoke test de esta sesión (RECIBO_NOMINA con
--    período obviamente sintético 1900-1903, o cualquier "TEST DESECHABLE" en
--    el nombre) — deberían ser 0, ya se limpiaron vía API y se verificó con
--    una relectura, pero se confirma aquí una vez más antes de migrar nada.
SELECT id, "employeeId", tipo, nombre, "uploadedAt"
FROM hr_document
WHERE nombre ILIKE '%DESECHABLE%'
   OR nombre ~ 'Recibo de nómina 19(0[0-3])-01-01'
ORDER BY "uploadedAt" DESC;

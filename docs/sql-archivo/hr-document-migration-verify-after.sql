-- ESTADO: APLICADO en producción: la migración MigrateHrDocumentFilesToStoredFile1788400000000 consta en la tabla migrations (verificado en solo lectura el 2026-10-30; la fecha de aplicación no está registrada). Verificación posterior, solo lectura.
-- Archivado en docs/sql-archivo/. No volver a ejecutar sin revisar.

-- ============================================================================
-- Verificación de solo lectura — DESPUÉS de correr
-- MigrateHrDocumentFilesToStoredFile1788400000000 en producción.
-- Compara contra la línea base del audit (2026-08-31): 26 hr_document con archivo
-- (1 fileData, 25 url), 18 stored_file preexistentes (todas ownerType='contract').
--
-- NO ESCRIBE NADA. Son puros SELECT.
--
--   psql -h <host_produccion> -p <puerto> -U <usuario> -d <bd> -f hr-document-migration-verify-after.sql
-- ============================================================================

\timing on

-- 1) hr_document ya no debe tener columnas fileData/url.
SELECT column_name FROM information_schema.columns
WHERE table_name = 'hr_document' AND column_name IN ('fileData', 'url');
-- Esperado: 0 filas.

-- 2) stored_file total y por ownerType — esperado: 18 (contract, sin cambio) + 26
--    (hr_document) = 44 en total.
SELECT count(*) AS total_stored_file FROM stored_file;
SELECT "ownerType", count(*) FROM stored_file GROUP BY "ownerType" ORDER BY 2 DESC;

-- 3) Todas las filas hr_document con role='file' deben tener provider/providerRef|url
--    consistente. Ninguna debe tener provider='cloudinary' con providerRef vacío Y url
--    nula a la vez (perdería el archivo por completo).
SELECT count(*) AS filas_hr_document_migradas
FROM stored_file WHERE "ownerType" = 'hr_document' AND role = 'file';
-- Esperado: 26.

SELECT id, "ownerId", provider, "providerRef", url, "mimeType"
FROM stored_file
WHERE "ownerType" = 'hr_document' AND role = 'file'
  AND (provider = 'cloudinary' AND (url IS NULL OR url = '') AND ("providerRef" IS NULL OR "providerRef" = ''));
-- Esperado: 0 filas.

-- 4) Cada hr_document con archivo (26 según el audit) debe tener EXACTAMENTE una fila en
--    stored_file — ni 0 (se perdió en la migración) ni 2+ (algo raro insertó dos veces).
SELECT hd.id, hd.tipo, count(sf.id) AS filas_stored_file
FROM hr_document hd
LEFT JOIN stored_file sf ON sf."ownerType" = 'hr_document' AND sf."ownerId" = hd.id::text AND sf.role = 'file'
GROUP BY hd.id, hd.tipo
HAVING count(sf.id) <> 1
ORDER BY 3 DESC;
-- Esperado: 0 filas (todo hr_document tiene exactamente 1 stored_file, incluidos los que
-- antes no tenían archivo — si esto trae filas con 0, revisar contra el audit si esa fila
-- ya existía sin archivo desde antes, o si es una pérdida real).

-- 5) Desglose por tipo — debe calzar con la sección 5 del audit (INE 10, CONTRATO 8, CURP 8).
SELECT hd.tipo, count(*) AS total, count(sf.id) AS con_stored_file
FROM hr_document hd
LEFT JOIN stored_file sf ON sf."ownerType" = 'hr_document' AND sf."ownerId" = hd.id::text AND sf.role = 'file'
GROUP BY hd.tipo ORDER BY total DESC;

-- 6) El único caso real con fileData base64 (id ead272e0-36b1-4593-8e7f-cdec68fd74f8, ver
--    audit) debe haber quedado con provider='base64_postgres', mimeType='image/jpeg',
--    providerRef sin el prefijo "data:".
SELECT provider, "mimeType", left("providerRef", 20) AS providerRef_head, "sizeBytes"
FROM stored_file
WHERE "ownerType" = 'hr_document' AND "ownerId" = 'ead272e0-36b1-4593-8e7f-cdec68fd74f8';

-- 7) El único caso real con URL de Cloudinary (id 320783cb-0d1b-4e0b-9679-7d754b9dff29, ver
--    audit) debe haber quedado con provider='cloudinary', url intacta, providerRef
--    reconstruido (public_id sin extensión).
SELECT provider, url, "providerRef", "mimeType"
FROM stored_file
WHERE "ownerType" = 'hr_document' AND "ownerId" = '320783cb-0d1b-4e0b-9679-7d754b9dff29';

-- 8) Las 24 filas de seed con URL placeholder deben haber quedado con
--    provider='base64_postgres' y providerRef vacío (no 'cloudinary' con un public_id
--    inventado) — ver nota de la migración sobre por qué.
SELECT count(*) AS placeholders_ok
FROM stored_file
WHERE "ownerType" = 'hr_document' AND role = 'file'
  AND url LIKE 'https://example.com/%' AND provider = 'base64_postgres' AND "providerRef" = '';
-- Esperado: 24.

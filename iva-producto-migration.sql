-- IVA configurable — columna product."tasaIva" (tasa propia por producto). SIN EJECUTAR.
-- Nullable, sin default: NULL = usa la tasa del negocio (ivaTasaDefault). Ningún producto existente cambia.
-- Idempotente. Termina en ROLLBACK: revisa los SELECT y cambia a COMMIT.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f iva-producto-migration.sql
-- Se corre ANTES de desplegar el código que lee product."tasaIva" (si no, GET /pos/products da 500).
BEGIN;

ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "tasaIva" character varying(10);
ALTER TABLE "product" DROP CONSTRAINT IF EXISTS "CHK_product_tasaIva";
ALTER TABLE "product" ADD CONSTRAINT "CHK_product_tasaIva"
  CHECK ("tasaIva" IS NULL OR "tasaIva" IN ('16','8','0','EXENTO'));

-- Deja constancia en la tabla de migraciones de TypeORM para que `migration:run` no la repita.
INSERT INTO "migrations" ("timestamp", "name")
SELECT 1789200000000, 'AddTasaIvaToProduct1789200000000'
WHERE NOT EXISTS (SELECT 1 FROM "migrations" WHERE "name" = 'AddTasaIvaToProduct1789200000000');

-- Verificación
SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
FROM information_schema.columns WHERE table_name = 'product' AND column_name = 'tasaIva';
SELECT count(*) AS productos, count("tasaIva") AS con_tasa_propia FROM "product";  -- con_tasa_propia = 0
SELECT conname FROM pg_constraint WHERE conname = 'CHK_product_tasaIva';

ROLLBACK;  -- cambia a COMMIT; tras revisar

-- Reversa (si hiciera falta):
--   ALTER TABLE "product" DROP CONSTRAINT IF EXISTS "CHK_product_tasaIva";
--   ALTER TABLE "product" DROP COLUMN IF EXISTS "tasaIva";
--   DELETE FROM "migrations" WHERE "name" = 'AddTasaIvaToProduct1789200000000';

-- Prueba pública — lista de espera por giro («Avísame cuando esté listo mi giro»). SIN EJECUTAR. Idempotente (IF NOT EXISTS).
-- Termina en ROLLBACK: revisa los SELECT y cambia a COMMIT.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prueba-publica-lista-espera-migration.sql
--
-- Solo CREA una tabla nueva; no modifica ninguna fila ni tabla existente. El código se puede desplegar antes de correr este SQL:
-- mientras la tabla no exista, POST /prueba/avisame responde 503 con un mensaje genérico (no se pierde nada ni se rompe la prueba).
--
-- Qué guarda: SOLO la solicitud de aviso. No crea cuenta ni negocio. El correo va cifrado (AES-256-GCM; se necesita en claro solo para avisar)
-- y como hash con sal (para no duplicar); el consentimiento (fecha, versión y URL del aviso de privacidad) lo estampa el servidor.
BEGIN;

CREATE TABLE IF NOT EXISTS "pruebas_lista_espera" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "correoHash" character varying(64) NOT NULL,
  "correoDominio" character varying(120) NOT NULL,
  "correoCifrado" text NOT NULL,
  "giro" character varying(20) NOT NULL,
  "avisoAceptadoEn" TIMESTAMPTZ NOT NULL,
  "avisoVersion" character varying(40) NOT NULL,
  "avisoUrl" character varying(300) NOT NULL,
  "ip" character varying(64),
  "avisadoEn" TIMESTAMPTZ,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "PK_pruebas_lista_espera" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_lista_espera_correo_giro" ON "pruebas_lista_espera" ("correoHash", "giro");
CREATE INDEX IF NOT EXISTS "IDX_lista_espera_giro" ON "pruebas_lista_espera" ("giro", "avisadoEn");
CREATE INDEX IF NOT EXISTS "IDX_lista_espera_ip" ON "pruebas_lista_espera" ("ip", "createdAt");

-- ── Verificación (revisa antes de cambiar a COMMIT) ──────────────────────────────────────────────────────────────────────
SELECT table_name FROM information_schema.tables WHERE table_name = 'pruebas_lista_espera';                   -- 1 fila
SELECT indexname FROM pg_indexes WHERE tablename = 'pruebas_lista_espera' ORDER BY indexname;                  -- 4 filas (PK + 3)
SELECT count(*) AS avisos FROM pruebas_lista_espera;                                                           -- 0

ROLLBACK;  -- cambia a COMMIT; tras revisar

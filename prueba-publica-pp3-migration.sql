-- Prueba pública PP3 — bitácora de eventos (avisos de fin de prueba idempotentes). SIN EJECUTAR. Idempotente (IF NOT EXISTS).
-- Termina en ROLLBACK: revisa los SELECT y cambia a COMMIT.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prueba-publica-pp3-migration.sql
--
-- Solo CREA una tabla nueva; no modifica ninguna fila ni tabla existente. El código se puede desplegar antes de correr este SQL: mientras la tabla no
-- exista, la tarea de avisos se detiene con una ALERTA en el log y NO envía nada (no manda un correo que no pueda registrar); la purga y el resto de la
-- prueba no dependen de esta tabla.
--
-- Qué guarda: un registro por (prueba, aviso) -- AVISO_25 / AVISO_28 / AVISO_30 -- con su estado (ENVIANDO | ENVIADO | OMITIDO). Sin datos personales.
BEGIN;

CREATE TABLE IF NOT EXISTS "pruebas_eventos" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "pruebaId" uuid NOT NULL,
  "tipo" character varying(20) NOT NULL,
  "estado" character varying(10) NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "PK_pruebas_eventos" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_pruebas_eventos_prueba_tipo" UNIQUE ("pruebaId", "tipo"),
  CONSTRAINT "CHK_pruebas_eventos_estado" CHECK ("estado" IN ('ENVIANDO','ENVIADO','OMITIDO'))
);

-- Verificación: la tabla existe y está vacía.
SELECT to_regclass('public.pruebas_eventos') IS NOT NULL AS existe, (SELECT count(*) FROM "pruebas_eventos") AS filas;

ROLLBACK; -- cambia a COMMIT tras revisar

-- Preferencias de interfaz por usuario ("uiPrefs": hoy { "skin": "estia|oscuro|claro|contraste" }).
-- Aditivo e idempotente: no toca filas existentes (todas quedan en '{}' = usan la skin del negocio).
-- Correr ANTES de desplegar el código: TypeORM selecciona todas las columnas de la entidad.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "uiPrefs" jsonb NOT NULL DEFAULT '{}'::jsonb;

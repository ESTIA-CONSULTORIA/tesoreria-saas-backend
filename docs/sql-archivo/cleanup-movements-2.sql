-- ESTADO: APLICADO en producción: los movimientos que borra ya no existen (verificado en solo lectura el 2026-10-30; la fecha de aplicación no está registrada).
-- Archivado en docs/sql-archivo/. No volver a ejecutar sin revisar.

DELETE FROM movement WHERE id IN ('ada70f04-2226-455a-886e-bc80b560ec8a', '09f3b618-4dc0-4c17-94b1-88d5b23aeb05');
SELECT balance FROM bank WHERE id = 'af1592b1-9a64-4f36-8ea5-b6003e0d8133';
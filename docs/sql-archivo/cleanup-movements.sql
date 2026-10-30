-- ESTADO: APLICADO en producción: los movimientos que borra ya no existen (verificado en solo lectura el 2026-10-30; la fecha de aplicación no está registrada).
-- Archivado en docs/sql-archivo/. No volver a ejecutar sin revisar.

DELETE FROM movement WHERE id IN ('a29f5de0-7027-48cd-860e-d293d3baa7df', 'b8dbfd66-ce4c-4970-bbb0-ff5e5be9f197');
SELECT balance FROM bank WHERE id = 'af1592b1-9a64-4f36-8ea5-b6003e0d8133';
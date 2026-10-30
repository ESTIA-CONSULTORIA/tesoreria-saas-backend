-- ESTADO: APLICADO en producción: no existe la fila BUSINESS+pacientes en plan_modules (verificado en solo lectura el 2026-10-30; la fecha de aplicación no está registrada).
-- Archivado en docs/sql-archivo/. No volver a ejecutar sin revisar.

-- ============================================================================
-- Housekeeping: fila obsoleta BUSINESS + pacientes en plan_modules (producción).
--
-- Contexto (ver comentario completo en src/config/module-giro-requirements.config.ts y
-- seed.ts línea ~2965): decisión de producto confirmada por Miguel el 2026-09-20 — 'pacientes'
-- se quitó del listado PLAN_MODULES.BUSINESS en seed.ts porque prometerlo ahí era engañoso
-- (el gate de giro en module-giro-requirements.config.ts ya lo bloqueaba para cualquier
-- tenant no médico/dental de todos modos). El seed solo INSERTA filas que faltan
-- (planModuleRepo.findOne + save si no existe, seed.ts línea ~2981) — nunca borra ni
-- actualiza filas que ya no están en el objeto PLAN_MODULES. La fila BUSINESS+pacientes
-- (included=true), sembrada antes de esa decisión, sigue en producción.
--
-- Esto NO cambia el comportamiento real: ModulesService.initFromPlan() sigue filtrando por
-- moduleAllowedForGiro() (modules.service.ts línea 78) antes de activar nada — el módulo
-- solo se activa de verdad para giros 'medico_dental'/'medico_general'
-- (module-giro-requirements.config.ts línea 29), sin importar lo que diga esta fila. Es
-- housekeeping puro: dejar la tabla consistente con lo que el código fuente anuncia hoy.
--
-- Tabla real: "plan_modules" (columnas camelCase, requieren comillas dobles en SQL crudo) —
-- @Entity('plan_modules'), src/modules/entities/plan-module.entity.ts:3.
--
-- Se elige DELETE sobre UPDATE included=false porque es el único patrón que existe en el
-- resto de la tabla: seed.ts nunca escribe included=false (solo inserta con included=true si
-- falta la fila) y ningún otro código de la app escribe en plan_modules — hoy, TODA fila que
-- existe en esta tabla tiene included=true; una fila con included=false sería la única
-- excepción en todo el catálogo, sin ningún lector que distinga ese caso a propósito. DELETE
-- deja la tabla en el mismo estado que tendría si el seed se corriera desde cero con el
-- PLAN_MODULES actual (fuente de verdad). Si prefieres el UPDATE de todos modos (registro
-- histórico de que existió), está comentado más abajo como alternativa.
--
-- Uso (requiere tu aprobación explícita antes de correr nada de esto — mismo protocolo de
-- siempre para escrituras directas a producción):
--   1) Corre primero el SNAPSHOT ANTES solo, pégame el resultado.
--   2) Con tu aprobación, corre la sección DELETE (o el UPDATE alternativo, no ambos).
--   3) Corre el SNAPSHOT DESPUÉS y verifica que coincide con lo esperado.
--
--   psql -h <host_produccion> -p <puerto> -U <usuario> -d <bd> -f plan-modules-business-pacientes-cleanup.sql
-- ============================================================================

-- ── SNAPSHOT ANTES ──────────────────────────────────────────────────────────
-- Esperado: 1 fila, included = true (la fila obsoleta que vamos a retirar).
SELECT * FROM plan_modules WHERE "planCode" = 'BUSINESS' AND "moduleCode" = 'pacientes';


-- ── LIMPIEZA (elegir UNA de las dos opciones; DELETE es la recomendada) ────

-- Opción A — DELETE (recomendada, ver justificación arriba):
DELETE FROM plan_modules WHERE "planCode" = 'BUSINESS' AND "moduleCode" = 'pacientes';

-- Opción B — UPDATE (alternativa, si prefieres conservar el registro histórico):
-- UPDATE plan_modules SET included = false
--   WHERE "planCode" = 'BUSINESS' AND "moduleCode" = 'pacientes';


-- ── SNAPSHOT DESPUÉS ─────────────────────────────────────────────────────────
-- Con Opción A (DELETE), esperado: 0 filas.
-- Con Opción B (UPDATE), esperado: 1 fila, included = false.
SELECT * FROM plan_modules WHERE "planCode" = 'BUSINESS' AND "moduleCode" = 'pacientes';

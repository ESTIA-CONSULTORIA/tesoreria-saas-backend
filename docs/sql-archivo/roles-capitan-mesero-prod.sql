-- ESTADO: APLICADO en producción: los roles CAPITAN y MESERO existen (verificado en solo lectura el 2026-10-30; la fecha de aplicación no está registrada). No consta si fue este script u otra vía.
-- Archivado en docs/sql-archivo/. No volver a ejecutar sin revisar.

-- Roles CAPITAN y MESERO (global: la tabla `role` no tiene tenant; code es unico). Idempotente: si el rol ya
-- existe no lo duplica. Replica lo que hace RolesService.create(): 1 fila en role + 14 permisos
-- (canView=true, canCreate/Edit/Delete=false), uno por valor del enum permission_module_enum.
-- NO se ejecuto contra ninguna base. Termina en ROLLBACK: revisa los SELECT y cambia a COMMIT.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f roles-capitan-mesero-prod.sql
-- (en Railway: railway ssh -> psql contra la BD de produccion, o pegar el contenido en un cliente SQL)
BEGIN;

INSERT INTO role (code, name, description, "isActive")
SELECT v.code, v.name, v.description, true
FROM (VALUES
  ('CAPITAN', 'Capitán de meseros', 'Mesas y cuentas abiertas; sin caja salvo que la política lo permita'),
  ('MESERO',  'Mesero',             'Abre cuentas, agrega ítems y quita los que no salieron a cocina')
) AS v(code, name, description)
WHERE NOT EXISTS (SELECT 1 FROM role r WHERE r.code = v.code);

INSERT INTO permission (module, "canView", "canCreate", "canEdit", "canDelete", "roleId")
SELECT m.module, true, false, false, false, r.id
FROM role r
CROSS JOIN (SELECT unnest(enum_range(NULL::permission_module_enum)) AS module) m
WHERE r.code IN ('CAPITAN', 'MESERO')
  AND NOT EXISTS (SELECT 1 FROM permission p WHERE p."roleId" = r.id);

-- Verificacion: cada rol nuevo con 14 permisos
SELECT r.code, r.name, r."isActive", count(p.id) AS permisos
FROM role r LEFT JOIN permission p ON p."roleId" = r.id
WHERE r.code IN ('CAPITAN', 'MESERO') GROUP BY r.id, r.code, r.name, r."isActive" ORDER BY r.code;

ROLLBACK;  -- cambia a COMMIT; tras revisar

-- OPCIONAL (no necesario): ampliar la CHECK de BD "sucursal obligatoria" a MESERO/CAPITAN. La regla ya se
-- aplica en la aplicacion (UsersService); la CHECK es una red de seguridad. Es un cambio de esquema: solo si lo quieres.
--   ALTER TABLE "user" DROP CONSTRAINT <nombre-de-la-check-de-1787818605257>;
--   ALTER TABLE "user" ADD CONSTRAINT <mismo-nombre> CHECK ("isActive" = false OR "roleCode" NOT IN ('CAJERO','GERENTE','MESERO','CAPITAN') OR ("companyId" IS NOT NULL AND "branchId" IS NOT NULL));

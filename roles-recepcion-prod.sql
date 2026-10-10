-- Rol RECEPCION (gimnasio). SIN EJECUTAR. Global: la tabla `role` no tiene tenant; code es único. Idempotente: si el rol ya
-- existe no lo duplica. Replica lo que hace RolesService.create(): 1 fila en role + 14 permisos (canView=true,
-- canCreate/Edit/Delete=false), uno por valor del enum permission_module_enum — mismo patrón que roles-capitan-mesero-prod.sql.
-- Termina en ROLLBACK: revisa los SELECT y cambia a COMMIT.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f roles-recepcion-prod.sql
-- (en Railway: railway ssh -> psql contra la BD de producción, o pegar el contenido en un cliente SQL)
BEGIN;

INSERT INTO role (code, name, description, "isActive")
SELECT v.code, v.name, v.description, true
FROM (VALUES
  ('RECEPCION', 'Recepción', 'Gimnasio: cobra y renueva membresías, da de alta socios y registra su entrada; sin descuentos ni cortesías')
) AS v(code, name, description)
WHERE NOT EXISTS (SELECT 1 FROM role r WHERE r.code = v.code);

INSERT INTO permission (module, "canView", "canCreate", "canEdit", "canDelete", "roleId")
SELECT m.module, true, false, false, false, r.id
FROM role r
CROSS JOIN (SELECT unnest(enum_range(NULL::permission_module_enum)) AS module) m
WHERE r.code = 'RECEPCION'
  AND NOT EXISTS (SELECT 1 FROM permission p WHERE p."roleId" = r.id);

-- Verificación: el rol nuevo con 14 permisos
SELECT r.code, r.name, r."isActive", count(p.id) AS permisos
FROM role r LEFT JOIN permission p ON p."roleId" = r.id
WHERE r.code = 'RECEPCION' GROUP BY r.id, r.code, r.name, r."isActive";

ROLLBACK;  -- cambia a COMMIT; tras revisar

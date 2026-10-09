# Checklist de alta de cliente (restaurante con POS y cuentas de mesa)

Pasos en orden. Cada uno dice **quién** lo hace y si va por **interfaz**, **API** o **SQL**. No saltes ninguno: los
pasos 5 a 9 dependen de que el tenant, el plan y la capacidad de mesas ya existan.

Convenciones: `$API` = `https://api.estiaconsultoria.com/api/v1`. `TENANT` = id del tenant creado en el paso 1.
`SOPORTE` = tu usuario de soporte (`admin@estia.com`, sin tenant). Los pasos por API necesitan el token de la
sesión indicada (cookie de login); en el navegador, abre la sesión y usa la consola o el cliente HTTP que prefieras.

---

## 0. Antes de empezar (una vez por entorno, no por cliente)

- [x] Los roles globales **CAPITAN** y **MESERO** **ya están creados en producción** (son globales: valen para todos los
      tenants, no se crean por cliente). Solo en una base nueva o local: **SQL** `roles-capitan-mesero-prod.sql`
      (termina en `ROLLBACK`; revisa los SELECT y cámbialo a `COMMIT`). Verifica:
      `SELECT code, "isActive" FROM role WHERE code IN ('CAPITAN','MESERO');` → 2 filas.
- [ ] Migraciones al día en la base (`npm run migration:run`). Una base atrasada da 500 al activar módulos.

## 1. Crear el tenant (SOPORTE)

**Interfaz:** panel SOPORTE → Gestión de clientes → nuevo cliente. **API equivalente:** `POST $API/tenants` (solo SOPORTE).

Datos mínimos:

| Campo | Valor |
|---|---|
| `legalName` / `tradeName` | Razón social y nombre comercial |
| `giro` | `restaurante` |
| `plan` | **`BUSINESS`** (ver paso 2; `BASIC` no trae POS) |
| `email` + `password` + `ownerName` | Quién será el **ADMIN** del cliente |
| `slug` | Corto y único (el cajero lo usa para entrar al POS Lite) |

El alta crea sola: tenant, usuario ADMIN, empresa principal, sucursal `MATRIZ`, suscripción y los módulos del plan.
Si la respuesta trae `warning`, los módulos no se inicializaron: corre el paso 2b.

> El ADMIN que crea el alta **no trae empresa ni sucursal** en su token. Es lo esperado; las asigna cada usuario operativo (paso 4).

## 2. Plan y módulos (SOPORTE)

**2a. Verificar** (interfaz: Gestión de clientes → módulos del cliente; API: `GET $API/modules/tenant/TENANT`).
Con `BUSINESS` deben estar activos al menos: `pos`, `configuracion_pos`, `costos`, `usuarios`, `empresas`, `sucursales`.

- `configuracion_pos` es obligatorio: sin él **productos, categorías, áreas y mesas** responden 403.
- `costos` es lo que da insumos, recetas y descuento de inventario.
- Planes LITE (`LITE_POS`, `LITE_CORTE`) limitan a **3 usuarios**: no sirven para un restaurante con meseros.

**2b. Si falta alguno:** interfaz (activar módulo) o `POST $API/modules/tenant/TENANT/activate` con
`{"moduleCode":"configuracion_pos"}`; o re-inicializar todo: `POST $API/modules/tenant/TENANT/init` con `{"planCode":"BUSINESS"}`.

## 3. Activar `mesas_cuenta_abierta` (API o SQL — **no hay interfaz**)

Sin esta capacidad no existen cuentas de mesa, ni el menú **Mesas**, ni las políticas de cobro y división.

**API** (con sesión del ADMIN del tenant o de SOPORTE):

```
PUT $API/tenant-settings/TENANT
{ "posCapabilities": { "mesas_cuenta_abierta": true } }
```

Opcional, si el negocio manda comandas a cocina/barra: `"notas_cocina_barra": true` en el mismo objeto.

**SQL** (alternativa; la fila de `tenant_setting` ya existe si alguien abrió Apariencia o el POS, si no, usa la API):

```sql
UPDATE tenant_setting
SET "posCapabilities" = (COALESCE("posCapabilities"::jsonb, '{}'::jsonb) || '{"mesas_cuenta_abierta": true}'::jsonb)::json
WHERE "tenantId" = 'TENANT';
-- debe afectar 1 fila
```

**Verifica:** `GET $API/tenant-settings/TENANT` → `posCapabilities.mesas_cuenta_abierta === true`.

## 4. Sucursales y usuarios por rol (ADMIN del cliente, por interfaz)

**Interfaz:** Sucursales (una por local) y Usuarios (`/users`). **API:** `POST $API/branches`, `POST $API/users`.

Roles y qué pueden hacer (los topes son del servidor):

| Rol | Entra con | Descuento | Cortesía | Cobra |
|---|---|---|---|---|
| ADMIN | correo + contraseña | sin tope | sí | caja y mesa |
| GERENTE | correo + contraseña | sin tope | sí | caja y mesa |
| CAJERO | NIP (4 dígitos) o correo | hasta **10 %** | **no (403)** | caja |
| CAPITAN | NIP o correo | hasta **20 %** | **no (403)** | mesa, según política |
| MESERO | NIP o correo | no | **no (403)** | mesa, solo con `MESERO_EN_MESA` |

La **cortesía** (venta sin cobro) solo la registran GERENTE y ADMIN; queda estampado su correo como `autorizadoPor`.
Un cajero que necesite dar una cortesía pide al gerente que la cobre desde su sesión.

Reglas del servidor al crear:

- **CAJERO, GERENTE, MESERO y CAPITAN exigen empresa y sucursal** (si no: 400 "requieren empresa y sucursal").
- El **NIP es la contraseña de 4 dígitos** de CAJERO/MESERO/CAPITAN y debe ser **único en el negocio**.
- El ADMIN del cliente debe quedar **sin sucursal propia**: si tiene una, todo usuario que cree hereda *su* sucursal e
  ignora la del formulario. Para varios locales, crea los usuarios con SOPORTE (manda `tenantId`, `companyId`, `branchId`).

Mínimo para operar un local: 1 GERENTE, 1 CAJERO, 1 CAPITAN, 1+ MESERO, todos con la misma sucursal.

## 5. Áreas, mesas y productos (GERENTE o ADMIN)

1. **Categorías** — **sin interfaz de alta: API** `POST $API/pos/categories` con `{"name":"Bebidas","branchId":"<sucursal>"}` (sesión ADMIN/GERENTE).
   Una por familia (Bebidas, Alimentos…), en la sucursal correcta. Deben existir **antes** de importar productos.
2. **Áreas y mesas** — menú **Mesas** → configuración (interfaz, `/mesas`): primero áreas (Terraza, Salón, Barra), luego
   mesas con número y capacidad. Se ligan a la sucursal elegida.
3. **Productos** — POS → importar productos CSV (interfaz), **con la sucursal activa del usuario** (el producto queda en esa
   sucursal; con varias sucursales importa una vez por cada una). Columnas: `nombre,categoria,precio,impuesto,descripcion,estacion`
   (la plantilla del botón ya las trae):
   - `categoria`: tal cual una categoría **de esa sucursal** (con dos sucursales el mismo nombre es otra categoría en cada una).
   - `precio`: **sin IVA** (el servidor suma 16 %). El precio que cobra el POS sale siempre de aquí, no del cliente.
   - `estacion`: `COCINA` o `BARRA` (obligatoria si usas notas de cocina/barra; vacía = el producto no genera nota). Otro valor
     rechaza esa fila. La respuesta trae `sinEstacion` = cuántas filas quedaron sin estación.
   - API equivalente: `POST $API/pos/products/import` con `{"productos":[...],"branchId":"<sucursal>"}` (o header `x-branch-id`).
     Con una sola sucursal, `branchId` es opcional; con varias es obligatorio (400 si falta).
4. **Lo que el CSV no deja (SQL o `PUT $API/pos/products/:id`)**, por producto:
   - `type = 'PREPARADO'` + `recipeId`, o `type = 'SIMPLE'` + `insumoId`, para que la venta **descuente inventario**.
5. **Inventario** — módulo Costos: insumos, recetas y existencias iniciales (interfaz). Después define `stockPolicy`:
   - **Hay insumos y existencias cargadas → `BLOQUEAR`**: no se vende lo que no hay.
     `PUT $API/tenant-settings/TENANT {"stockPolicy":"BLOQUEAR"}` (ADMIN del tenant o SOPORTE).
   - **No hay insumos cargados (solo se opera el POS y el corte) → `PERMITIR_NEGATIVO`**, que es el default: con `BLOQUEAR` y sin
     existencias no se podría vender nada.
   Verifica: `GET $API/tenant-settings/TENANT` → `stockPolicy`. No lo dejes en el default por omisión si ya cargaste insumos.

## 6. Las tres políticas (ADMIN del cliente; interfaz o API)

**Interfaz:** POS → configuración (solo ADMIN; las dos de mesas aparecen con la capacidad del paso 3).
**API:** `PUT $API/tenant-settings/TENANT/<ruta>`.

| Política | Ruta | Valores (default primero) | Qué decide |
|---|---|---|---|
| Devoluciones | `politica-devoluciones` | `SOLO_GERENTE`, `CAJERO_LIBRE` | Quién devuelve una venta cobrada |
| Cobro | `politica-cobro` | `SOLO_CAJA`, `GERENTE_EN_MESA`, `MESERO_EN_MESA` | Quién cobra una cuenta de mesa y desde dónde |
| División | `politica-division-cuentas` | `GERENTE_CAPITAN_CAJERO`, `SOLO_GERENTE`, `TODOS` | Quién puede cobrar dividido (por persona, por ítem, parcial) |

Los defaults ya aplican sin guardar nada; **guárdalas explícitamente** para que queden registradas y verifica con
`GET $API/tenant-settings/TENANT/politica-cobro` (y las otras dos). Un valor inválido responde 400.

## 7. Turno de prueba (CAJERO, interfaz)

1. Entra al POS con el NIP del CAJERO (o correo) y abre turno con un fondo (p. ej. $500). `POST /pos/shifts`.
2. Comprueba que el turno aparece abierto en esa sucursal (`GET $API/pos/shifts/open?cajero=...&sucursalId=...`).

## 8. Venta de prueba y cuenta de mesa

Marca todo lo de prueba con "[PRUEBA]" en nota/motivo.

1. **Mesa:** MESERO abre cuenta en una mesa, agrega 2 productos (uno de cocina) → total = precio × cant. × **1.16**.
2. **Descuento:** CAJERO aplica 10 % → pasa; intenta 10.01 % → **403** con mensaje claro. CAPITAN: 20 % pasa, 20.01 % → 403.
   GERENTE: cualquier porcentaje. En una cuenta de $116: CAJERO hasta $11.60 (total $104.40), CAPITAN hasta $23.20 (total $92.80).
   `PUT /pos/sales/:id/discount` recalcula el total en el servidor: `nuevoTotal` debe ser el total sin descuento menos `descuento`.
3. **Cortesía:** CAJERO intenta cobrar como cortesía → **403**; GERENTE la cobra y en la venta queda su correo como `autorizadoPor`.
4. **Cobro** según la política del paso 6 (con `SOLO_CAJA`, el mesero **no** cobra: 403).
5. **Venta directa** (sin mesa): una venta en efectivo con cambio; el corte debe sumar el total, no lo recibido.
6. **Devolución:** GERENTE devuelve la venta de prueba → regresa inventario y dinero.

## 9. Corte

1. Con **cero cuentas abiertas** en mesas (el cierre se bloquea si hay alguna: cóbralas o cancélalas).
2. CAJERO: precorte (opcional) y **cerrar turno** con el efectivo contado.
3. El resumen del turno (`GET $API/pos/shifts/:id/summary`) y la respuesta del cierre traen `efectivoEsperado` =
   fondo + efectivo de ventas + depósitos − retiros, y `diferencia` = contado − esperado (**negativo = faltante**).
   Ejemplo: fondo $500, ventas en efectivo $292, depósito $50, retiro $100 → esperado **$742**; contado $735 → diferencia **−$7**.
4. Aprobación: el cajero pide aprobación en el chat del corte y **solo ADMIN o GERENTE** aprueban o rechazan (otro rol: 403; el
   chat de un turno de otro negocio no existe: 404). La aprobación queda registrada en el chat; el cierre del turno **no** la exige.

## 10. Cierre del alta

- [ ] `POST $API/auth/login` sin credenciales → **401** (no 500, no 200).
- [ ] Las ventas de prueba quedan identificadas y devueltas; el turno de prueba, cerrado.
- [ ] Entregar al cliente: usuario ADMIN, el `slug`, los NIP de cada rol y las tres políticas elegidas.
- [ ] `PATCH $API/tenants/TENANT/onboard` cuando el cliente termine el asistente de inicio (o desde la interfaz).

### Resumen: qué es interfaz y qué requiere API/SQL

| Paso | Interfaz | API / SQL |
|---|---|---|
| 1 Tenant, 2 Plan y módulos | Sí (panel SOPORTE) | Alternativa API |
| 3 `mesas_cuenta_abierta` | **No** | **API o SQL** |
| 4 Usuarios y sucursales | Sí | — |
| 5 Categorías | **No** | **API** (`POST /pos/categories`) |
| 5 Áreas y mesas | Sí | — |
| 5 Productos (alta masiva, con sucursal y estación) | Sí (CSV) | **SQL/API** solo para receta/insumo |
| 5 `stockPolicy` | **No** | **API** (`PUT /tenant-settings/:id`) |
| 6 Políticas | Sí (ADMIN) | Alternativa API |
| 0 Roles CAPITAN/MESERO | No | Ya creados en producción; **SQL** solo en una base nueva |
| 7 a 9 Turno, venta, corte | Sí | — |

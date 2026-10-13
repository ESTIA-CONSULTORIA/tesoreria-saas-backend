# ESTADO-SISTEMA — auditoría de solo lectura

Fecha: 2026-10-12 · Auditoría original sobre `main`: backend `7322dd36`, frontend `22b55d6e`.
**Actualizado el mismo día (ronda 4) — hashes finales en `origin/main` y desplegados:** backend código `03dac93` (rondas anteriores: `bbb0543`, `b71f9ba`, `f732488`), frontend `2b1d302`. Railway: backend SUCCESS sobre `03dac93`, frontend SUCCESS sobre `2b1d302`, Postgres SUCCESS. `POST /api/v1/auth/login` sin credenciales → 401; `GET /api/v1/tenants` y `PUT /api/v1/tenants/x/plan` sin sesión → 403.

## Método y límites (leer primero)

- **Solo lectura.** Código de `main`, consultas `READ ONLY` a producción y presencia (no valor) de variables de entorno. No se creó ni cambió nada.
- **Conservadora:** ante la duda, `PARCIAL`. `OPERATIVO` exige código completo **y** pruebas automáticas que cubran el flujo.
- **Nunca abrí un navegador.** Todo lo que dice "no probado en navegador" significa que ningún paso de esta auditoría ejecutó esa pantalla. La única evidencia de uso real en pantalla que tengo es el producto con `tasaIva "8"` creado desde la pantalla Productos en producción.
- **No pude autenticarme en producción** (el login con el demo fue bloqueado por el clasificador de permisos y no se intentó otra vía). Ningún endpoint autenticado se ejercitó en producción.
- **Pruebas automáticas:** backend 89 suites / 890 tests (jest); frontend **4 archivos de prueba / 63 tests** para 101 componentes `.tsx`. Las pantallas casi no tienen cobertura automática.
- Producción hoy: 4 tenants (genérico PROFESIONAL, genérico LITE_POS, médico dental BASIC, genérico BUSINESS), 15 usuarios, 11 ventas, 7 turnos, 21 productos. **Es un volumen de demo/piloto**: no hay evidencia de operación con dinero real sostenida.

## 0. Hallazgos cerrados (rondas 2 a 4; todo en `origin/main` y desplegado)

| Hallazgo | Estado | Qué cambió | Pruebas |
|---|---|---|---|
| C1 plan/estado de tenants | **CERRADO en código** | `PUT /tenants/:id/plan` solo SOPORTE; `PATCH /tenants/:id/onboard` solo SOPORTE o ADMIN del propio tenant; `/subscriptions` (crear, cambiar plan, renovar, alertas) solo SOPORTE; `/plans` y `/business-types` (escritura) solo SOPORTE | CAJERO, ADMIN de otro tenant e incluso ADMIN propio → 403 en `/plan` |
| C2 lectura de tenants | **CERRADO en código** | `GET /tenants` devuelve solo el tenant del token (SOPORTE ve todos); `GET /tenants/:id` y `GET /subscriptions/tenant/:id` → 403 si no es el propio | specs de aislamiento |
| C5b onboard | **CERRADO en código** | `PATCH /tenants/:id/onboard`: SOPORTE, ADMIN o GERENTE, solo de su propio tenant (otro tenant → 403) | spec |
| `GET /companies` | **CERRADO en código** | solo SOPORTE ve todas; el resto, las de su tenant; sin tenant en el token → 403 | spec |
| `GET /dashboard/kpis` y `/company/:id/kpis` | **CERRADO en código** | el tenant sale del token; la empresa debe pertenecerle (404 si no); nunca cae a la primera empresa de la BD | spec |
| `registerPayment` | **CERRADO en código** | la `accountId` del pago debe ser del tenant de la factura (400 "Cuenta no encontrada") | spec |
| `POST /administration/audit-logs` | **CERRADO en código** | el `tenantId` del body solo vale para SOPORTE | spec |
| B10 botones sin acción | **CERRADO en código** (frontend) | CxP: "Pagar ahora" abre el modal de pago en Compras (`/purchases?pagar=id`); "Programar pago" se quitó (no hay programación de pagos en el backend). Dashboard: "Ver detalle completo →" navega a `/reports` | spec del enlace |
| C3 `ENCRYPTION_KEY` | **CERRADO y desplegado** (`f732488`) | sin valor por omisión: 500 claro al cifrar/descifrar si falta o tiene menos de 32 caracteres; no tumba el arranque. En producción la variable existe (64 caracteres) y `integration` tenía 0 filas: no hubo migración | 9 specs |
| B5 turno único por cajero | **CERRADO en producción: índice único parcial creado (0 duplicados previos; válido)** | `openShift` traduce la violación de unicidad a 400 "Ya tienes un turno abierto. Ciérralo antes de abrir otro" (antes el `save` sin `await` dejaba escapar el error) | 5 specs |
| `x-company-id` en `GET /dashboard/kpis` | **CERRADO y desplegado** | debe ser empresa del tenant del token; si no, 404 | 4 specs |
| tenant desde `@Query`/header/body en costs, hr y payroll | **CERRADO y desplegado** | el tenant sale del token (`tenantDeSesion`); header/query/body solo valen para SOPORTE; usuario sin tenant → 403; `POST /costs/inventory` ya no toma el `tenantId` del body. Corrige además `GET /costs/inventory`, `cost-of-sales`, `physical-counts` y `physical-counts/period`, que leían `?tenantId=` directo (sin filtro, devolvían todos si se omitía) | 15 specs |
| C4 `/accounts` y `/categories` heredados | **CERRADO en código** | cuentas: el tenant sale de branch → company (crear/listar/por sucursal, 403 en sucursal ajena); `POST /categories` solo SOPORTE (tabla global sin tenant) | specs |
| C5 permisos de roles | **CERRADO en código** | `PUT /roles/:id/permissions/:module` solo SOPORTE. **Efecto de producto:** un ADMIN de tenant ya no puede editar la matriz desde `RolesPage`/`UsersPage` (recibirá 403); ningún guard del backend la lee. Decisión tuya si se prefiere ADMIN+SOPORTE | specs |
| C6 `initialize-default` público | **CERRADO en código** | requiere ADMIN o SOPORTE (`RolesPage` ya lo llama con sesión) | spec |
| (nuevo) IDOR por id | **CERRADO en código** | órdenes y facturas de compra (`/purchases/orders/:id…`, `/invoices/:id…`), proveedores, documentos OCR, consultas, alertas de insumo: la id ajena responde 404 y no escribe. `GET /purchases/invoices`, `/accounts-payable` y `/costs/justificables` ya no aceptan `?tenantId=` de un usuario de tenant (antes, sin el parámetro devolvían **todos** los tenants) | 29 specs |
| (nuevo) Cajero con id crudo | **CERRADO en código** (frontend) | `PanelCuenta` ya no cae a `cuenta.cajero`; POSPage resuelve por nombre y Lite no muestra el cajero | spec |

Verificación: backend `tsc` limpio, jest **97 suites / 1025 tests** en verde; frontend `tsc` limpio, vitest **7 archivos / 77 tests** en verde.
**Siguen abiertos:** C7, C8 y los de la tabla "Pendientes del barrido" (§8b).

### Hallazgo C3 — `ENCRYPTION_KEY` (CERRADO; se conserva el análisis)

- **Qué se cifra:** únicamente `integration.credentials` (módulo Integraciones: certificados/llaves SAT, claves IMSS, secretos bancarios), con AES-256-CBC y la llave derivada por SHA-256 de `ENCRYPTION_KEY`. Código: `integrations.service.ts:7-27`.
- **Riesgo:** la variable está vacía en producción, así que se usa la constante del repositorio `'estia_key_2024_32bytes_padding!!'`. Quien lea el repo y obtenga una fila de `integration.credentials` la descifra.
- **Dato que baja el riesgo:** `decrypt()` **no se llama en ningún lugar** (no hay cliente HTTP en el módulo) y la respuesta de la API elimina `credentials` (`delete copy.credentials`). Es decir, hoy lo cifrado solo se escribe.
- **¿Hay datos cifrados en producción?** **No verificado**: la consulta por `railway ssh` fue rechazada por el clasificador de permisos. Consulta de solo lectura (cuenta filas, no imprime credenciales): `SELECT COUNT(*) FILTER (WHERE credentials IS NOT NULL AND length(credentials) > 0) AS con_credenciales, COUNT(*) AS filas FROM integration;` — se corre con `railway connect Postgres` (psql) o con `railway ssh --service tesoreria-saas-backend -- node -e "..."` usando `DATABASE_URL`.
- **Procedimiento seguro propuesto (esperando tu visto bueno):** 1) correr la consulta de solo lectura; 2) si hay 0 filas con credenciales → definir `ENCRYPTION_KEY` (32+ bytes aleatorios) en Railway y quitar el valor por omisión del código (que falle si falta); 3) si hay filas → script de migración que descifre con la llave actual y recifre con la nueva dentro de una transacción, con respaldo de la tabla y verificación antes de `COMMIT`; 4) guardar la llave en un gestor de secretos: perderla hace irrecuperables las credenciales.

## 1. Hallazgos críticos (seguridad, aislamiento, dinero)

Ordenados por severidad. "Confirmado por código" = leí el controlador y el servicio; no lo exploté.

| # | Hallazgo | Evidencia | Riesgo | Tamaño |
|---|---|---|---|---|
| C1 | **CERRADO (ver §0)** · **`PUT /tenants/:id/plan` sin `@Roles`**: cualquier usuario autenticado cambia el plan de **cualquier** tenant. Mismo caso: `PATCH /tenants/:id/onboard`. | `tenants.controller.ts:87-95` (el `PUT :id` sí tiene `@Roles('SOPORTE')`, estos dos no) | Dinero (plan = lo que se cobra y qué módulos se ven) + aislamiento | **S** |
| C2 | **CERRADO (ver §0)** · **`GET /tenants` y `GET /tenants/:id` sin filtro**: cualquier autenticado lista todos los clientes y lee el registro completo (RFC, plan, facturación) de cualquiera. | `tenants.controller.ts:45-70` | Fuga entre tenants | **S** |
| C3 | **CERRADO (ver §0)** · **Credenciales de integraciones cifradas con una llave que está en el código**: `ENCRYPTION_KEY` está **vacía en producción** y el servicio cae a `'estia_key_2024_32bytes_padding!!'`. | `integrations.service.ts:7`; `printenv` en Railway | Seguridad (quien tenga el repo descifra lo guardado) | **S** (definir variable + recifrar) |
| C4 | **CERRADO (ver §0)** · **`/accounts` y `/categories` heredados sin tenant**: `GET /accounts` devuelve las cuentas de todos; `POST /accounts` acepta `branchId` ajeno; `GET /accounts/branch/:id` sin validar. Hoy `account` tiene 0 filas en producción (sin datos expuestos), pero la puerta está abierta. | `accounts.controller.ts`, `accounts.service.ts:31-36` | Aislamiento | **S** |
| C5 | **CERRADO (ver §0)** · **`PUT /roles/:roleId/permissions/:module` sin `@Roles`** (los roles son **globales**, un cambio afecta a todos los tenants). **No encontré ningún guard que lea la tabla `permission`**, así que el impacto real depende de si algo la consulta (PARCIAL: verificar). | `roles.controller.ts:46-52` | Seguridad / aislamiento | **S** |
| C6 | **PARCIAL (ver §0)**: `initialize-default` cerrado; `GET /roles` y `GET /roles/code/:code` siguen públicos · **`POST /roles/initialize-default` y `GET /roles` son `@Public()`**: escritura anónima. Es idempotente, pero crearía `SUPER_ADMIN` y `VIEWER` en producción, que hoy no existen. | `roles.controller.ts:28-44` | Seguridad (baja) | **S** |
| C7 | **Rate limit general de 120/min por defecto**; solo los 4 logins públicos tienen el límite estricto. El check-in de membresías y el login por NIP del POS tienen su limitador propio (en memoria: se reinicia con cada deploy y no se comparte entre instancias). | `app.module.ts:62-67`, `nip-throttle.service.ts` | Seguridad (media) | **M** si se escala a >1 instancia |
| C8 | **CORS manual refleja el origen** si está en `ALLOWED_ORIGINS` (constante en código; la variable de entorno está vacía). No es abierto, pero el log dice "CORS habilitado para todos los orígenes": mensaje engañoso. | `main.ts:15-36` | Bajo | **S** |

Corregido en la ronda anterior (para que no se reporte dos veces): categorías, bancos, movimientos, `/pos/config/:branchId`, compras `?tenantId=`, producto/venta/turno con sucursal ajena.

**Pendiente conocido, no corregido:** un GERENTE con sucursal puede editar/borrar productos de **otra** sucursal de su tenant (el filtro es por tenant). Y las categorías con sucursal `NULL` (compartidas) **no se pueden editar ni borrar** (404), porque no tienen tenant propio; una categoría `NULL` nueva tampoco tiene tenant propio y requeriría una columna `tenantId` en una migración futura (sin implementar).

## 2. Estado por módulo

Leyenda: **OPERATIVO** (código + pruebas automáticas del flujo), **PARCIAL** (existe, con huecos o sin pruebas del flujo completo), **CATÁLOGO** (existe la entrada/pantalla pero no hace el trabajo), **NO IMPLEMENTADO**. Columna Nav = nunca abierto en navegador por esta auditoría.

| Módulo | Estado | Evidencia | Huecos | Nav |
|---|---|---|---|---|
| Autenticación, sesión, cookies, refresh | OPERATIVO | login 401 en producción; limitador de login; specs | tokens en memoria/cookie; sin 2FA | no |
| POS: venta, cobro, formas de pago, ticket de cuenta | PARCIAL | servidor recalcula precio/IVA/total (specs); 11 ventas en producción | tarjeta es **captura manual** (sin terminal ni procesador de pago); impresión de ticket no verificada | no |
| POS: turnos, corte Z, efectivo esperado/diferencia | OPERATIVO (backend) | specs de shifts/corte; efectivo esperado y diferencia | **sin índice de un turno abierto por cajero** (existe solo en el diseño de asignaciones, sin migrar) | no |
| POS: descuentos con topes, cortesías, devoluciones | OPERATIVO (backend) | topes por rol servidor-side, CORTESIA solo GERENTE/ADMIN, devolución con tasa sellada | topes en `TOPE_DESCUENTO_PCT` (código, no configurables por negocio) | no |
| IVA configurable (negocio y producto, incluido o no) | OPERATIVO (backend) · PARCIAL (UI) | `iva.config.ts`, specs; columna `tasaIva` en producción | UI de IVA vista en pantalla solo para crear producto | **parcial** |
| Mesas y cuentas abiertas | PARCIAL | specs de cuenta abierta/roles; pantalla `MesasPage` | **no probada en navegador**; división de cuenta con políticas | no |
| POS Lite (NIP, corte lite, cocina, mesero) | PARCIAL | specs de NIP/limitador; flujos `CorteCajaLite`, `NotasCocinaLite`, `MeseroPage` | sin pruebas de pantalla | no |
| Offline (cola, sincronización, ventas fallidas) | PARCIAL | `syncEngine` con specs (11); folio idempotente; revisión manual de fallidas | **nunca probado en navegador sin red**; pérdida de IndexedDB = pérdida de cola | no |
| Productos y categorías (catálogo) | OPERATIVO (backend) | specs de aislamiento; producto creado en producción | sucursal NULL = compartido; categorías NULL no editables | **parcial** (alta de producto sí) |
| Inventario y costos (insumos, recetas, almacenes, mermas) | PARCIAL | 43 endpoints; descuento por receta en venta con specs | sin conteo físico/ajustes verificados; reglas de reemplazo complejas | no |
| Compras y proveedores | PARCIAL | 17 + 7 endpoints | sin recepción contra inventario verificada | no |
| Membresías (gimnasio) | OPERATIVO (backend) · PARCIAL (UI) | tablas en producción; specs de ciclo, check-in, reportes | **`MembresiasPage` nunca abierta en navegador**; **cobro recurrente no existe**; tarjetas de socio/QR no existen | no |
| Bancos, movimientos, transferencias | PARCIAL | specs de movimientos/transferencias | tabla heredada `account`; sin pruebas de conciliación de punta a punta | no |
| Conciliación bancaria | PARCIAL | 11 endpoints, specs | importación de estados de cuenta manual; sin conectores bancarios | no |
| Reportes y vista ejecutiva | PARCIAL | `reports` 5 endpoints; `ExecutiveReport` | módulo **PRESUPUESTO "Próximamente"**; sección móvil "próximamente" | no |
| Tesorería (CxP/CxC, flujo, alertas) | PARCIAL | 15 endpoints | **botones sin acción** (sección 3) | no |
| RH, nómina, contratos, portal del empleado | PARCIAL | 43 + 19 + 12 endpoints; humo de nómina en producción vía `curl` (archivos `payroll-smoke-*`) | **IMSS/IDSE no conectado**; timbrado de nómina no existe | no |
| Pacientes y citas (médico) | PARCIAL | specs; `ligar_venta_a_cita` | un tenant dental real (Riova) en uso; sin pruebas de pantalla | no |
| OCR de facturas | PARCIAL | `ocr.service` con regex | calidad no medida; dependencia externa no verificada | no |
| Facturación CFDI | **NO IMPLEMENTADO** | solo entrada de catálogo `sat-cfdi`; sin código de timbrado | todo el giro retail/restaurante que necesita factura | — |
| Integraciones (BBVA, Banorte, CONTPAQi, IMSS, SoftRestaurant…) | **CATÁLOGO** | `integration` guarda credenciales cifradas; **ningún cliente HTTP** en el módulo | ninguna integración hace nada | — |
| Suscripciones y planes | PARCIAL | `SubscriptionGuard`, alerta diaria 9:00 | **sin pasarela de pago**: el cobro del SaaS es manual | no |
| Módulos y Centro de Soluciones | OPERATIVO | filtro por giro, specs | tarjeta "solicitar" por WhatsApp (manual) | no |
| Administración / Soporte multi-tenant | PARCIAL | `AdministrationController` con guard de clase | ver C1–C2 | no |
| Auditoría (logs) | PARCIAL | `AuditInterceptor` global | cobertura por acción no medida | no |

## 3. Botones que no hacen nada

Detección por revisión estática de los 101 `.tsx`: 20 `<button>` sin `onClick`/`submit`; la mayoría son falsos positivos (`disabled` con `>` en la expresión). Confirmados:

| Pantalla | Botón | Estado |
|---|---|---|
| `TreasuryPage.tsx` (CxP) | "Programar pago" por fila | **QUITADO** (no existe programación de pagos en el backend) |
| `TreasuryPage.tsx` (CxP) | "Pagar ahora" por fila | **CONECTADO**: abre el modal de pago de la factura en Compras |
| `DashboardPage.tsx` | "Ver detalle completo →" | **CONECTADO**: navega a Reportes |
| `SettingsPage.tsx` (~L530, 540) y `SettingsPreviewModal.tsx` | botones de vista previa de apariencia | decorativos a propósito |
| `LoginConfigPage.tsx` (~L102) | botón de vista previa | `disabled` a propósito |
| `ExecutiveReport.tsx` | módulo PRESUPUESTO | "Próximamente" |
| `MobileAnalyticsApp.tsx` | sección | "estará disponible próximamente" |

**No ejecutado:** no hice clic en ninguno; la lista es estática. Pueden existir botones con `onClick` que llaman a endpoints que no existen (esa verificación requiere navegador).

## 4. Huecos de dinero

| # | Hueco | Estado | Tamaño |
|---|---|---|---|
| D1 | `PUT /tenants/:id/plan` abierto (C1) | confirmado | S |
| D2 | **No hay cobro automático del SaaS**: sin pasarela ni cobro recurrente; la membresía del gimnasio tampoco se cobra sola | NO IMPLEMENTADO | L |
| D3 | **Pagos con tarjeta capturados a mano**: el sistema no concilia contra el terminal | PARCIAL | M (conciliación) / L (integración) |
| D4 | **Sin facturación CFDI** | NO IMPLEMENTADO | L |
| D5 | Un cajero puede tener **más de un turno abierto** a la vez (sin índice único); el efectivo esperado se calcula por turno, no por persona | confirmado · SQL listo sin ejecutar: `b5-turnos-abiertos-por-cajero.sql` (conteo, detalle e índice único parcial) | S (índice) tras limpiar duplicados |
| D6 | Reporte de ingresos de membresías **reparte descuento e IVA de cuenta de forma proporcional** (aproximado) | conocido | S |
| D7 | Topes de descuento y cortesías **en código**, no por negocio | conocido | S |
| D8 | Cola offline: ventas en IndexedDB del navegador; si se borra, se pierden; el folio idempotente evita duplicados pero no recupera lo perdido | conocido | M |
| D9 | Tabla `account` heredada y reportes que dependen de ella | PARCIAL | M |

Lo que **sí** está cubierto por pruebas: precio e IVA siempre del servidor, descuento de cuenta con IVA proporcional, cortesía solo GERENTE/ADMIN, devolución con la tasa sellada, corte Z con IVA y efectivo esperado, atomicidad de `applyDiscount`, folio idempotente.

## 5. Seguridad y aislamiento — resumen

- **Aislamiento de tenant en POS:** razonablemente sólido tras las dos últimas rondas (tenant del JWT en todo el POS; sucursal efectiva única). Los hallazgos abiertos están **fuera del POS** (C1–C6).
- **Autenticación:** JWT firmado con `JWT_SECRET` (definido), cookies httpOnly, refresh con rotación, login limitado.
- **Secretos:** `ENCRYPTION_KEY` definida (C3 cerrado). `NODE_ENV` también vacío en Railway: revisar qué ramas del código dependen de él (cookies `secure`, etc.) — **no verificado**.
- **Sucursal:** `X-Branch-Id` ya no es permiso en POS/bancos/movimientos/dashboard/compras/costos; falta recorrer RR.HH. y reportes con la misma lupa.
- **Sin asignaciones por sucursal:** un usuario tiene una sola sucursal y un solo rol; el diseño de asignaciones está sin implementar.

## 6. Qué puede operar cada giro de punta a punta

"De punta a punta" = alta del negocio → configurar → vender/cobrar → cerrar caja → reporte. Conservador: todo **sin verificar en navegador**.

| Giro | Punta a punta | Detalle |
|---|---|---|
| **Genérico / retail** | **PARCIAL** | Alta, productos, venta, corte Z con IVA: sí (backend probado). Falta: CFDI, lector/impresora no verificados, inventario con conteo no verificado. |
| **Restaurante** | **PARCIAL** | Mesas, cuentas abiertas, notas a cocina/barra, división de cuenta, NIP Lite: backend probado. **Pantallas nunca abiertas en navegador**; sin integración de impresora de comanda verificada; CFDI no. |
| **Gimnasio** | **PARCIAL** | Giro, rol RECEPCION, módulo membresías, planes, socios, cobro por el POS con IVA y topes, check-in con límite de intentos, alertas y reportes: **backend completo y desplegado**. `MembresiasPage` nunca abierta; sin cobro recurrente; sin reservas (Playtomic, fuera de alcance). |
| **Médico dental / general** | **PARCIAL** | Pacientes, citas, consultas, venta ligada a cita. Tenant real en uso (Riova). Sin CFDI, sin expediente clínico formal. |

## 7. Bloqueantes de venta (para vender a un cliente real mañana)

| # | Bloqueante | Tamaño |
|---|---|---|
| B1 | ~~Cerrar C1–C2~~ **hecho en código (§0); falta desplegar** | **S** |
| B2 | ~~Definir `ENCRYPTION_KEY` y recifrar credenciales (C3)~~ **hecho y desplegado** | **S** |
| B3 | ~~Cerrar `/accounts`, `/categories`, permisos de roles (C4–C6)~~ **hecho en código (§0); falta desplegar** | **S** |
| B4 | **Prueba de punta a punta en navegador** de POS, corte, mesas y membresías con datos reales (Sección 8) | **M** |
| B5 | ~~Índice de un turno abierto por cajero~~ **CERRADO en producción: índice único parcial creado (0 duplicados previos; válido)** (SQL en `b5-turnos-abiertos-por-cajero.sql`) | **S** |
| B6 | CFDI (para cualquier cliente que facture) | **L** |
| B7 | Cobro del SaaS (pasarela / recurrente) y de membresías | **L** |
| B8 | Conciliación/terminal de tarjeta | **M–L** |
| B9 | Cola offline: política de respaldo y prueba sin red real | **M** |
| B10 | ~~Botones sin acción en Tesorería y Dashboard~~ **hecho en código (§0); falta desplegar** | **S** |
| B11 | Cobertura automática del frontend (hoy 4 archivos) | **L** |

Orden sugerido: B1–B3 (un día), B5 y B10 (medio día), B4 (con el cliente piloto), luego B9; B6–B8 según el primer cliente.

## 8. Lo que nunca se probó en navegador

Todo el frontend, salvo la creación de producto con IVA desde Productos (evidencia en producción). En particular:

- POS: abrir turno, vender, cobrar mixto, descuentos, cortesía, devolución, corte Z, impresión.
- Mesas y cuentas abiertas, división de cuenta, `MeseroPage`, `NotasCocinaLite`.
- POS Lite por NIP y `CorteCajaLite`.
- Offline: vender sin red, sincronizar, "ventas fallidas", cierre con pendientes.
- `MembresiasPage`: alta de socio, cobro/renovación, congelar, check-in, alertas, reportes, planes.
- Selector de sucursal y el comportamiento del header rancio (`active_branch_id`).
- Tesorería (CxP/CxC), conciliación, nómina, contratos y portal del empleado, OCR.
- Vista ejecutiva y móvil.
- Los 403 nuevos de sucursal en un flujo real con usuarios distintos.

## 8b. Pendientes del barrido de controllers (sin corregir)

Tras la ronda quedan ~316 endpoints sin `@Roles`; la gran mayoría están acotados por tenant en su servicio y son lecturas/escrituras normales de usuarios del negocio. Lo que **no** se corrigió y conviene revisar:

| Archivo | Endpoint | Nota |
|---|---|---|
| `companies.controller.ts` | `@Public GET /companies/tenant/:tenantId` | intencional (kiosko Lite); expone razón social/RFC/isActive de las empresas de un tenant a quien conozca su id |
| `tenant-settings.controller.ts` | `@Public GET /tenant-settings/:tenantId` | intencional (branding antes del login); expone poco |
| `costs.controller.ts` | `PUT/DELETE /costs/inventory/:id`, `GET /costs/inventory/:insumoId/:periodo`, `GET /costs/recipes/:id/cost` | operan por id sin tenant en el controller; **no verifiqué** si el servicio acota |
| `hr.controller.ts`, `payroll.controller.ts` | `x-company-id` por header cuando el token no trae `companyId` | el servicio ya filtra por tenant; una empresa ajena devolvería vacío, pero no se valida con 404 |
| `hr.controller.ts` | `PATCH attendance/:id`, `POST attendance/audit/:auditId/revert` | por id sin tenant en el controller; no verificado en el servicio |
| `users.controller.ts`, `pos/cashiers.controller.ts`, `companies.controller.ts` | `req.user.tenantId || body.tenantId` / `?tenantId=` | mismo patrón de fallback a cliente: falta pasarlos a `tenantDeSesion` |
| varios (~300 endpoints) | sin `@Roles` | acotados por tenant en su servicio; no hay auditoría línea por línea de cada uno |

## 9. Lo que no cubre esta auditoría

- No ejecuté el frontend ni ningún endpoint autenticado en producción.
- **Consulta de solo lectura a producción (conteo de productos con vínculos no UUID y filas de `integration`): NO ejecutada** — `railway ssh` fue rechazado por el clasificador de permisos; pendiente de que la corras tú.
- No auditó dependencias (`npm audit`), infraestructura de Railway ni respaldos de la BD.
- Conteo de botones por heurística de texto; no es análisis de AST.
- No revisé pantallas de RR.HH./nómina más allá de endpoints y archivos de humo existentes.

# ESTADO-SISTEMA — auditoría de solo lectura

Fecha: 2026-10-12 · Sobre `main` ya mergeado: backend `7322dd36a2e3f5bf25b6e731b7b8a0a1e332ecfb`, frontend `22b55d6e5f12e8cfb5f7d0509c169acaa0e830b7`.
Railway: backend `73d880e0…` SUCCESS, frontend `c0696bad…` SUCCESS, Postgres SUCCESS. `POST /auth/login` sin credenciales → 401.

## Método y límites (leer primero)

- **Solo lectura.** Código de `main`, consultas `READ ONLY` a producción y presencia (no valor) de variables de entorno. No se creó ni cambió nada.
- **Conservadora:** ante la duda, `PARCIAL`. `OPERATIVO` exige código completo **y** pruebas automáticas que cubran el flujo.
- **Nunca abrí un navegador.** Todo lo que dice "no probado en navegador" significa que ningún paso de esta auditoría ejecutó esa pantalla. La única evidencia de uso real en pantalla que tengo es el producto con `tasaIva "8"` creado desde la pantalla Productos en producción.
- **No pude autenticarme en producción** (el login con el demo fue bloqueado por el clasificador de permisos y no se intentó otra vía). Ningún endpoint autenticado se ejercitó en producción.
- **Pruebas automáticas:** backend 89 suites / 890 tests (jest); frontend **4 archivos de prueba / 63 tests** para 101 componentes `.tsx`. Las pantallas casi no tienen cobertura automática.
- Producción hoy: 4 tenants (genérico PROFESIONAL, genérico LITE_POS, médico dental BASIC, genérico BUSINESS), 15 usuarios, 11 ventas, 7 turnos, 21 productos. **Es un volumen de demo/piloto**: no hay evidencia de operación con dinero real sostenida.

## 1. Hallazgos críticos (seguridad, aislamiento, dinero)

Ordenados por severidad. "Confirmado por código" = leí el controlador y el servicio; no lo exploté.

| # | Hallazgo | Evidencia | Riesgo | Tamaño |
|---|---|---|---|---|
| C1 | **`PUT /tenants/:id/plan` sin `@Roles`**: cualquier usuario autenticado cambia el plan de **cualquier** tenant. Mismo caso: `PATCH /tenants/:id/onboard`. | `tenants.controller.ts:87-95` (el `PUT :id` sí tiene `@Roles('SOPORTE')`, estos dos no) | Dinero (plan = lo que se cobra y qué módulos se ven) + aislamiento | **S** |
| C2 | **`GET /tenants` y `GET /tenants/:id` sin filtro**: cualquier autenticado lista todos los clientes y lee el registro completo (RFC, plan, facturación) de cualquiera. | `tenants.controller.ts:45-70` | Fuga entre tenants | **S** |
| C3 | **Credenciales de integraciones cifradas con una llave que está en el código**: `ENCRYPTION_KEY` está **vacía en producción** y el servicio cae a `'estia_key_2024_32bytes_padding!!'`. | `integrations.service.ts:7`; `printenv` en Railway | Seguridad (quien tenga el repo descifra lo guardado) | **S** (definir variable + recifrar) |
| C4 | **`/accounts` y `/categories` heredados sin tenant**: `GET /accounts` devuelve las cuentas de todos; `POST /accounts` acepta `branchId` ajeno; `GET /accounts/branch/:id` sin validar. Hoy `account` tiene 0 filas en producción (sin datos expuestos), pero la puerta está abierta. | `accounts.controller.ts`, `accounts.service.ts:31-36` | Aislamiento | **S** |
| C5 | **`PUT /roles/:roleId/permissions/:module` sin `@Roles`** (los roles son **globales**, un cambio afecta a todos los tenants). **No encontré ningún guard que lea la tabla `permission`**, así que el impacto real depende de si algo la consulta (PARCIAL: verificar). | `roles.controller.ts:46-52` | Seguridad / aislamiento | **S** |
| C6 | **`POST /roles/initialize-default` y `GET /roles` son `@Public()`**: escritura anónima. Es idempotente, pero crearía `SUPER_ADMIN` y `VIEWER` en producción, que hoy no existen. | `roles.controller.ts:28-44` | Seguridad (baja) | **S** |
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
| `TreasuryPage.tsx` (CxP, ~L898) | "Programar pago" por fila | **sin `onClick`** |
| `TreasuryPage.tsx` (CxP, ~L914) | segundo botón de acción de la fila | **sin `onClick`** |
| `DashboardPage.tsx` (~L601) | "Ver detalle completo →" | **sin `onClick`/navegación** |
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
| D5 | Un cajero puede tener **más de un turno abierto** a la vez (sin índice único); el efectivo esperado se calcula por turno, no por persona | confirmado | S (índice) tras limpiar duplicados |
| D6 | Reporte de ingresos de membresías **reparte descuento e IVA de cuenta de forma proporcional** (aproximado) | conocido | S |
| D7 | Topes de descuento y cortesías **en código**, no por negocio | conocido | S |
| D8 | Cola offline: ventas en IndexedDB del navegador; si se borra, se pierden; el folio idempotente evita duplicados pero no recupera lo perdido | conocido | M |
| D9 | Tabla `account` heredada y reportes que dependen de ella | PARCIAL | M |

Lo que **sí** está cubierto por pruebas: precio e IVA siempre del servidor, descuento de cuenta con IVA proporcional, cortesía solo GERENTE/ADMIN, devolución con la tasa sellada, corte Z con IVA y efectivo esperado, atomicidad de `applyDiscount`, folio idempotente.

## 5. Seguridad y aislamiento — resumen

- **Aislamiento de tenant en POS:** razonablemente sólido tras las dos últimas rondas (tenant del JWT en todo el POS; sucursal efectiva única). Los hallazgos abiertos están **fuera del POS** (C1–C6).
- **Autenticación:** JWT firmado con `JWT_SECRET` (definido), cookies httpOnly, refresh con rotación, login limitado.
- **Secretos:** `ENCRYPTION_KEY` vacía (C3). `NODE_ENV` también vacío en Railway: revisar qué ramas del código dependen de él (cookies `secure`, etc.) — **no verificado**.
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
| B1 | Cerrar C1–C2 (plan y listado de tenants abiertos) | **S** |
| B2 | Definir `ENCRYPTION_KEY` y recifrar credenciales (C3) | **S** |
| B3 | Cerrar `/accounts`, `/categories`, permisos de roles (C4–C6) | **S** |
| B4 | **Prueba de punta a punta en navegador** de POS, corte, mesas y membresías con datos reales (Sección 8) | **M** |
| B5 | Índice de un turno abierto por cajero (previa limpieza) | **S** |
| B6 | CFDI (para cualquier cliente que facture) | **L** |
| B7 | Cobro del SaaS (pasarela / recurrente) y de membresías | **L** |
| B8 | Conciliación/terminal de tarjeta | **M–L** |
| B9 | Cola offline: política de respaldo y prueba sin red real | **M** |
| B10 | Botones sin acción en Tesorería y Dashboard | **S** |
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

## 9. Lo que no cubre esta auditoría

- No ejecuté el frontend ni ningún endpoint autenticado en producción.
- No auditó dependencias (`npm audit`), infraestructura de Railway ni respaldos de la BD.
- Conteo de botones por heurística de texto; no es análisis de AST.
- No revisé pantallas de RR.HH./nómina más allá de endpoints y archivos de humo existentes.

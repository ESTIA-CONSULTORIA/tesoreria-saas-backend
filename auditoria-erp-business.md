# Auditoría funcional ERP — Módulos plan BUSINESS

**Estado:** COMPLETA (18/18 módulos) — un intento anterior en otra computadora se perdió al
cerrarse la sesión sin persistir; este archivo es la persistencia real, guardado
incrementalmente durante toda la auditoría.

**Fecha:** 2026-09-19

## Alcance

Catálogo fuente: `src/seed/seed.ts` → `MODULES_CATALOG` (línea ~2895) y `PLAN_MODULES.BUSINESS`
(línea ~2966):

```
BUSINESS: dashboard, empresas, sucursales, usuarios, configuracion, bancos, movimientos,
transferencias, reportes, tesoreria, conciliacion, pos, configuracion_pos, integraciones,
proveedores, compras, costos, pacientes
```

18 módulos. Cada uno se audita contra el código real (controller/service/entity/guard) y
contra comportamiento observado en un entorno corriendo. Los 5 módulos del clúster financiero
(bancos, movimientos, transferencias, conciliación, tesorería) y los 3 del clúster de
operaciones (proveedores, compras, costos) se agrupan en una sola sección cada uno porque
comparten guard/evidencia y se entienden mejor juntos — el orden exacto de PLAN_MODULES se
respeta dentro de cada clúster.

## Metodología y entornos usados

- **Entorno local** (`npm run start:dev`, puerto 3000, Postgres local `tesoreria` en :5432):
  el tenant "Grupo Empresarial Demo" (`49dc4947-1bd5-4d09-a50c-d84cf4326cea`) sí está en plan
  **BUSINESS** en la columna `tenant.plan`, pero la DB local tiene **10 migraciones sin
  aplicar** (`AddUniqueEmployeeUserId` … `AddCreatedByToMovement`). Al intentar aplicarlas:
  1. `AddCajeroGerenteCompanyBranchCheck1787818605257` falla porque el propio seed (`seed.ts`)
     crea usuarios GERENTE/CAJERO demo sin `companyId`/`branchId` (ver hallazgo real en la
     sección **usuarios**, confirmado también que la API no tiene forma de repararlos).
  2. Por eso migraciones posteriores —`AddGiroToTenant` (columna `giro`), las de `StoredFile`
     para contratos/documentos HR, `AddCreatedByToMovement`— no llegaron a correr en este
     entorno. Como `ModulesService.resolveGiro()`/`activateModule()`/`initFromPlan()` leen
     `tenant.giro`, **ninguna activación de módulo funciona en local** (500 confirmado:
     `no existe la columna Tenant.giro`) y por lo tanto el tenant BUSINESS local queda con
     `tenant_modules` vacío (`modulosActivos: []` al login) — todo endpoint con `@Modulo(...)`
     devuelve 403 salvo `dashboard` (exento explícito en el guard).
  - Intentos de reparar esto vía los propios endpoints de la API (activar módulos, corregir
    usuarios) fueron bloqueados por el clasificador de permisos de la sesión (escritura sobre
    "recursos compartidos"/"destrucción local"), así que se documenta como limitación del
    entorno en vez de forzarlo. Local se usa entonces solo para lo que SÍ responde sin
    depender de `tenant_modules` (endpoints sin `@Modulo`, o el módulo `dashboard`).
- **Producción** (`https://api.estiaconsultoria.com/api/v1`, usuario demo público
  `admin@demo.com`/`Admin123` del propio `seed.ts`): usado para verificación **de solo
  lectura (GET)** — es el único entorno donde el tenant demo tiene casi todos los módulos de
  BUSINESS realmente activos. Confirmado con `GET /tenants/:id`: `plan: "BUSINESS"`,
  `giro: "generico"`, y `modulosActivos` trae `dashboard, cortes, tesoreria, bancos, rh,
  compras, reportes, integraciones, usuarios, empresas, sucursales, auditoria, configuracion,
  movimientos, transferencias, conciliacion, pos, configuracion_pos, proveedores, costos` —
  **falta `pacientes`** (por el giro, ver hallazgo transversal #4), y trae extras (`rh`,
  `auditoria`) que no son de BUSINESS — evidencia de que la activación real de este tenant no
  se hizo con `initFromPlan('BUSINESS')` sino a mano. Escrituras (POST/PUT/DELETE) contra
  producción se evitaron salvo necesidad puntual ya cubierta por el equipo (ej. smoke tests
  documentados en archivos `.sql`/`.sh` sueltos en el repo de una sesión anterior), y cuando el
  clasificador de permisos bloqueó un intento de escritura se documenta como "no ejecutado,
  verificado solo por código" en vez de insistir.
- **Código**: lectura directa de controllers/services/entities/guards/migrations/config en
  `src/`, incluyendo `git log`/`git show` para hallazgos ya documentados por el propio equipo.
- Cada hallazgo cita archivo:línea o el curl/query ejecutado como evidencia real.

Leyenda: ✅ Funcional · ⚠️ Parcial · ❌ No implementado · 🔲 Cosmético (UI sin lógica real)

## Resumen ejecutivo

| # | Módulo | Estado | Notas breves |
|---|---|---|---|
| 1 | dashboard | ✅ Funcional | KPIs reales de bank/movement; CxC/CxP simulados, fallback silencioso a ceros ante error de DB, tabla dashboard_metric write-only |
| 2 | empresas | ✅ Funcional | CRUD real; ~~create/update/delete sin aislamiento de tenant (IDOR)~~ **corregido 2026-09-20**. GET tenant/:id sigue público (confirmado intencional, lo usa CorteCajaLite.tsx) |
| 3 | sucursales | ✅ Funcional | Mismo patrón que empresas: ~~CRUD real pero sin aislamiento de tenant en update/delete~~ **corregido 2026-09-20** |
| 4 | usuarios | ⚠️ Parcial | CRUD + RBAC reales; ~~update/remove/updateCompany/findByRole sin aislamiento de tenant~~ **corregido 2026-09-20**; ~~GET /users/email/:email filtraba el hash bcrypt, público~~ **corregido 2026-09-22**; usuarios legacy sin company/branch siguen siendo irreparables solo con la API |
| 5 | configuracion | ✅ Funcional | Upsert real de branding/stockPolicy; ~~PUT sin ningún guard~~ **corregido 2026-09-20** (PUT y POST) |
| 6 | bancos | ✅ Funcional | CRUD real; ~~update/delete por id sin filtro de tenant (IDOR)~~ **corregido 2026-09-19** |
| 7 | movimientos | ⚠️ Parcial | Registro/saldo reales, umbral de aprobación real; ~~approve/reject/create sin verificar tenant del accountId — el IDOR más grave del sistema~~ **corregido 2026-09-19** |
| 8 | transferencias | ⚠️ Parcial | Flujo con autorización real; ~~authorize/reject/create sin verificar tenant~~ **corregido 2026-09-19** — sigue pendiente la 2ª implementación en treasury que mueve dinero sin pasar por la tabla transfer ni la autorización |
| 9 | reportes | ✅ Funcional | 5 reportes con fórmulas contables reales sobre movement; tabla report write-only sin lectura |
| 10 | tesoreria | ✅ Funcional | Forecast y CxP reales; CxC es en realidad ingresos históricos relabeleados; confirmDeposit() roto (nombres de columna inexistentes) |
| 11 | conciliacion | ⚠️ Parcial | ~~IDOR en delete/updateStatus/manualReview/manualReconciliation/getAvailableMovements~~ **corregido 2026-09-20**; el "matching" sigue siendo 100% manual (sin algoritmo); 0 facturas cargadas en el tenant demo de producción |
| 12 | pos | ✅ Funcional | Ventas/turnos muy bien construidos (transacciones, stock, offline); ~~IDOR en sales/shifts por :id~~ **corregido 2026-09-20** (mismo patrón sigue abierto en products/categories/tables/areas, ver hallazgo transversal #6); el código de catálogo 'pos' sigue sin gatear nada de esto |
| 13 | configuracion_pos | ⚠️ Parcial | CRUD real de productos/categorías/mesas/áreas, correctamente gateado; update/delete por id sin aislamiento de tenant (mismo patrón que pos, pendiente) |
| 14 | integraciones | ❌ No implementado | Bien gateado y con buen CRUD de credenciales, pero testConnection() es fake y no hay ningún cliente HTTP real hacia BBVA/Banorte/SAT/ContPAQ/etc. |
| 15 | proveedores | ⚠️ Parcial | CRUD real y bien gateado; historial de compras por proveedor es un stub que siempre devuelve [] aunque el módulo de compras ya existe |
| 16 | compras | ✅ Funcional | Ciclo de vida completo orden→recepción→factura→pago, con integración real a movimientos/tesorería |
| 17 | costos | ✅ Funcional | Insumos/recetas/conversión de unidades real; bug crítico de conversión ya corregido y verificado en código |
| 18 | pacientes | ❌ No incluido en BUSINESS (decisión confirmada) | Código funcional de buena calidad, exclusivo de giro médico/dental; retirado a propósito de PLAN_MODULES.BUSINESS el 2026-09-20 para no prometerlo — sigue disponible automáticamente cuando el giro califica |

**Conteo (actualizado 2026-09-20):** 10 ✅ Funcional · 6 ⚠️ Parcial · 2 ❌ No implementado ·
0 🔲 puro (aunque varios módulos ✅/⚠️ tienen sub-hallazgos 🔲 puntuales, como el CxC simulado
del dashboard o el CxC de tesorería). El estado ⚠️/❌ restante ya no refleja únicamente el
patrón IDOR — ese hallazgo (transversal #6) está cerrado en 8 de los ~10 módulos donde
aparecía; lo que queda en ⚠️/❌ ahora es matching manual, integraciones sin conectar, doble
implementación de transferencias, etc. — ver cada sección.

## Hallazgos transversales (afectan a varios módulos del catálogo)

1. **El guard de módulos (`src/auth/plan-modulo.guard.ts`) es "todo o nada" contra
   `tenant_modules`, sin fallback al plan.** Comentario explícito en el código (línea 39):
   *"tenant_modules es la única fuente de verdad (Sistema 3). Sin fallback a config estática."*
   Si un tenant no tiene una fila en `tenant_modules` para un código, el endpoint decorado con
   `@Modulo('<code>')` devuelve 403 aunque `tenant.plan` diga BUSINESS y `PLAN_MODULES.BUSINESS`
   incluya ese código. Confirmado en vivo: tenant local BUSINESS con `tenant_modules` vacío →
   `modulosActivos: []` al login, único endpoint que no rompe es `dashboard` (exento a propósito,
   línea 30 del guard).
2. **Varios "módulos" del catálogo de precios no son un módulo de enforcement real — se
   colapsan en `tesoreria`.** `bancos`, `movimientos`, `transferencias` y `conciliacion` son 4
   entradas independientes en `MODULES_CATALOG` (cada una con nombre propio, categoría
   `finanzas`), pero sus controllers (`banks.controller.ts`, `movements.controller.ts`,
   `transfers.controller.ts`, `reconciliation.controller.ts`) están decorados con
   `@Modulo('tesoreria')`, no con su propio código. Técnicamente no existe forma de
   vender/activar "Bancos" sin "Movimientos" o viceversa — los 4 viven o mueren juntos con el
   flag `tesoreria`. Ver detalle en cada sección.
3. **El módulo `pos` (POS General, addon $400, catálogo) no está enforced por NINGÚN
   controller.** `grep -rn "@Modulo('pos')" src` no devuelve resultados. Lo que sí está
   gateado bajo `configuracion_pos` es `pos.controller.ts`, `products`, `categories`, `tables`,
   `areas`. Pero las ventas reales (`sales.controller.ts`), turnos (`shifts.controller.ts`,
   salvo el método de captura retroactiva que usa `corte_retroactivo`), cajeros
   (`cashiers.controller.ts`) y alertas de insumos no tienen `@Modulo` en absoluto — funcionan
   para cualquier tenant autenticado, tenga o no el addon `pos` contratado.
4. **✅ DECISIÓN DE PRODUCTO CONFIRMADA 2026-09-20 (Miguel) — `pacientes` se retiró de
   `PLAN_MODULES.BUSINESS`.** Estaba declarado ahí pero era prácticamente inactivable para un
   tenant BUSINESS típico: `src/config/module-giro-requirements.config.ts` restringe
   `pacientes` a los giros `medico_dental`/`medico_general`, y `ModulesService.
   activateModule()`/`initFromPlan()` saltan silenciosamente el módulo si el giro no califica.
   Miguel confirmó que ese bloqueo por giro es correcto como comportamiento — lo que estaba
   mal era prometerlo en el catálogo estándar de BUSINESS sin decirlo. Se quitó de la
   constante `BUSINESS` en `seed.ts` (sigue en `BASIC`, sin tocar — fuera del alcance de esta
   decisión) y se documentó explícitamente en `module-giro-requirements.config.ts` como
   decisión de producto, no solo restricción técnica. El mecanismo de activación por giro NO
   cambió: sigue siendo un módulo real y activable automáticamente en cuanto el giro califica,
   vía cualquier plan que sí lo liste o a mano por SOPORTE — solo dejó de anunciarse como
   parte del paquete estándar de BUSINESS. Ver sección `pacientes`.
5. **La DB local está 10 migraciones atrás y una de ellas
   (`AddCajeroGerenteCompanyBranchCheck`) no puede aplicarse porque el propio `seed.ts` viola
   la regla que intenta imponer, y la API de usuarios no tiene ruta para repararlo.** Detalle
   completo en la sección `usuarios`.
6. **🔴 Patrón sistémico: los endpoints "por :id" (PATCH/DELETE/GET de una sola entidad) casi
   nunca verifican que esa entidad pertenezca al tenant del usuario autenticado.** `@Modulo()`
   solo verifica que el TENANT tenga el módulo contratado — nunca que el RECURSO puntual
   (`id` en la URL) le pertenezca. Confirmado por código en:
   - ~~`banks.service.ts` → `update()`, `remove()`~~ **✅ corregido 2026-09-19** (ver sección `bancos`)
   - ~~`movements.service.ts` → `create()`, `approve()`, `reject()`, `findByAccount()`~~
     **✅ corregido 2026-09-19** — era el caso más grave (mutaba `balance` real cross-tenant),
     cerrado primero. Ver sección `movimientos` y pruebas en
     `src/movements/movements.tenant-isolation.spec.ts`.
   - ~~`transfers.service.ts` → `authorize()`, `reject()`, `create()`~~ **✅ corregido
     2026-09-19**. Ver sección `transferencias` y `src/transfers/transfers.tenant-isolation.spec.ts`.
   - ~~`companies.service.ts` → `update()`, `remove()`, `findOne()`~~ **✅ corregido
     2026-09-20**. Ver sección `empresas` y `src/companies/companies.tenant-isolation.spec.ts`.
   - ~~`branches.service.ts` → `update()`, `remove()`, `findByCompany()`~~ **✅ corregido
     2026-09-20**. Ver sección `sucursales` y `src/branches/branches.tenant-isolation.spec.ts`.
   - ~~`users.service.ts` → `update()`, `remove()`, `updateCompany()`~~ **✅ corregido
     2026-09-20** (de paso se corrigió también `GET /users/role/:roleCode`, que tomaba el
     tenantId directo de un query param sin mirar el JWT — mismo patrón, no estaba en la
     redacción original). Ver sección `usuarios` y `src/users/users.tenant-isolation.spec.ts`.
   - ~~`reconciliation.service.ts` → `deleteInvoice()`, `updateInvoiceStatus()`,
     `markForManualReview()`, `manualReconciliation()`, `getAvailableMovements()`~~ **✅
     corregido 2026-09-20**. Ver sección `conciliacion` y
     `src/reconciliation/reconciliation.tenant-isolation.spec.ts`.
   - ~~`pos/sales.service.ts` → `findOne()`, `pay()`, `cancel()`, `applyDiscount()`,
     `returnSale()`; `pos/shifts.service.ts` → `withdrawal()`, `deposit()`, `precut()`,
     `closeShift()`, `findOne()`, `getSummary()`~~ **✅ corregido 2026-09-20**. Ver sección
     `pos` y `src/pos/pos.tenant-isolation.spec.ts`.
   - **🆕 Hallazgo nuevo, mismo patrón, NO corregido todavía — descubierto al cerrar el punto
     anterior, fuera del alcance de esta ronda:** `products.service.ts`, `categories.service.ts`,
     `tables.service.ts`, `areas.service.ts` (todos bajo el módulo `configuracion_pos`) tienen
     el mismo `update(id)`/`delete(id)` sin filtro de tenant. `Product` y `Table` tienen
     `tenantId` propio (fix directo, mismo patrón que `banks`); `PosCategory` y `Area` solo
     tienen `branchId` (requiere resolver tenant vía `branchId → Branch → Company.tenantId`,
     dos saltos — mismo patrón que `branches.service.ts`, pero más trabajo). Pendiente de
     ronda aparte.

   Combinado con que casi todos los IDs son UUIDs v4 (no adivinables por fuerza bruta en la
   práctica), el riesgo real depende de que el atacante ya conozca el UUID de un recurso ajeno
   (filtrado por otro endpoint, logs, o un usuario que cambia de tenant). El caso con impacto
   financiero directo (bancos/movimientos/transferencias) ya se cerró; el resto queda para
   rondas siguientes, una a la vez, según la lista de Recomendaciones prioritarias.
7. **Dos tablas de solo escritura, nunca leídas, sin scoping de tenant:** `dashboard_metric`
   (una fila nueva por cada `GET /dashboard/kpis`) y `report` (una fila nueva por cada GET de
   `/reports/*`). Ninguna se lee en ningún otro punto del código — crecimiento ilimitado sin
   ningún beneficio funcional actual.
8. **✅ CERRADO 2026-09-22 — `GET /users/email/:email` filtraba el hash bcrypt de la
   contraseña, público, sin autenticación.** Descubierto 2026-09-20 al trabajar en
   `usuarios`. **Corrección de diagnóstico respecto a la redacción original de este mismo
   punto:** el hallazgo decía que la columna `password` de `User` no tenía `{ select: false }`
   — eso era un error de investigación (un grep que solo buscó la palabra "password" y no vio
   el decorador `@Column(...)` en la línea de arriba); la columna **ya tenía `select: false`
   desde el commit `3e5ce4c` (2026-06-21), meses antes de esta auditoría**. La causa real:
   `GET /users/email/:email` (`@Public()`) devolvía crudo el resultado de
   `UsersService.findByEmail()`, que a propósito reincluye el hash vía
   `.addSelect(['user.password'])` porque `auth.service.ts` lo necesita para
   `bcrypt.compare()` en el login — un endpoint público reexponía sin querer una consulta
   interna pensada solo para autenticación. Confirmado en vivo antes del fix:
   ```
   GET /users/email/admin@demo.com  (sin token) → 200 con "password":"$2b$10$..." real
   ```
   Grep fresco en todo el monorepo (`backend`, `frontend-core`, `deliveryhub-pro`) no encontró
   ningún consumidor de esa ruta — se eliminó el endpoint del controller.
   `UsersService.findByEmail()` **no se tocó**, sigue usándolo `auth.service.ts` para login/
   register/portal-login. Verificado en vivo después del fix: login correcto sigue
   funcionando idéntico, login con password incorrecta sigue rechazando con 401 (prueba que
   `bcrypt.compare()` sigue recibiendo el hash real internamente), y la ruta pública ahora da
   404. Pruebas: `src/users/users.public-email-leak.spec.ts`.

---

## 1. dashboard — ✅ Funcional (con hallazgos)

**Código:** `src/dashboard/dashboard.controller.ts`, `dashboard.service.ts`. Sin `@Modulo()` —
de hecho está exento explícitamente en `plan-modulo.guard.ts:30` (`if (requiredModulo ===
'dashboard') return true`), así que es el único módulo del catálogo que SIEMPRE responde,
tenga o no el tenant algo en `tenant_modules`.

**Evidencia real (producción, GET, El Sazón):**
```
GET /dashboard/kpis?period=month  (x-company-id=3818d293-...)
→ totalBalance: 138400 (suma real de bank.balance)
→ chart.income: 1910378, chart.expense: 414788 (sumas reales de movement.amount, todo el histórico)
→ latestMovements: 5 movimientos reales con datos coherentes (fecha, monto, referencia)
```
El cálculo de balance/ingresos/egresos por sucursal→empresa→tenant contra las tablas reales
`bank` y `movement` es real, no simulado (`dashboard.service.ts:67-190`).

**Hallazgos:**
- ⚠️ `accountsReceivable`/`accountsPayable` son **simulados**, no vienen de facturas reales:
  `dashboard.service.ts:199-200` — `currentIncome * 0.15` y `currentExpense * 0.10` a secas.
  `pendingInvoices` está hardcodeado a `0` (línea 201). El dashboard muestra "Cuentas por
  cobrar/pagar" con números que no corresponden a ningún dato capturado.
- ⚠️ **Fallback silencioso a ceros ante cualquier error de DB** (`dashboard.service.ts:375-397`):
  el `catch` genérico devuelve HTTP 200 con todo en cero en vez de propagar el error. Confirmado
  en local: con la columna `movement.createdBy` faltante (migración no aplicada), el log muestra
  `[Dashboard getKpis] Error capturado: no existe la columna movement.createdBy` y el endpoint
  igual responde 200 con ceros — un problema real de DB se ve idéntico a "no tienes movimientos
  este mes" para quien mira el dashboard.
- ⚠️ **Fallback de tenant a una empresa arbitraria** (`dashboard.controller.ts:27`): si
  `req.user.tenantId` no viene (pasa con usuarios SOPORTE, que tienen `tenantId: null`) y no
  se manda `x-tenant-id`, hace `(await this.companiesRepo.findOne({ where: {} }))?.tenantId` —
  toma la PRIMERA empresa que devuelva Postgres, sin `order by` ni relación con el usuario, y
  usa SU tenant. Con SOPORTE sin header explícito, el dashboard mostraría datos de un tenant
  cualquiera en vez de fallar o pedir contexto.
- 🔲 **`dashboard_metric` es una tabla de solo escritura, sin scoping por tenant** (ver
  hallazgo transversal #7).

## 2. empresas — ✅ Funcional

**Código:** `src/companies/companies.controller.ts` + `companies.service.ts`. Sin `@Modulo()`
— el "módulo" `empresas` del catálogo no está enforced por ningún guard, así que el endpoint
simplemente siempre responde a cualquier tenant, tenga o no `empresas` en `tenant_modules`
(esto no cambió con este fix — es un hallazgo de catálogo distinto, no de aislamiento).

**Lo que sí funciona:** alta/baja/listado real contra la tabla `company`, límite real de "1
empresa" para plan LITE (`companies.service.ts:24-28`, valida contra `tenant.plan`).

**✅ Corregido 2026-09-20 (hallazgo #2):**
- `POST /companies` confiaba en el `tenantId` del body sin cruzarlo contra el JWT — cualquier
  ADMIN autenticado podía crear una empresa dentro de OTRO tenant. Ahora el controller usa
  `req.user.tenantId` primero, y solo cae al `tenantId` del body cuando el JWT no trae uno
  (SOPORTE dando de alta una empresa en un tenant específico) — mismo criterio que
  `users.controller.ts::create()`.
- `PATCH /companies/:id`, `DELETE /companies/:id` y `GET /companies/:id` no filtraban por
  tenant en absoluto. `findOne()`/`update()`/`remove()` ahora exigen que la empresa pertenezca
  a `req.user.tenantId` (mismo criterio que `banks.service.ts::findOne(id, tenantId)`) y
  devuelven "no encontrada" en vez de un 403 explícito, para no revelar si el id existe en
  otro tenant. Pruebas: `src/companies/companies.tenant-isolation.spec.ts` (controller-level
  para `create()`, service-level para `update`/`remove`/`findOne`) — 5/8 casos cross-tenant
  reproducidos como fallo antes del fix, 8/8 pasan después.

**Revisado y confirmado intencional (sin cambios):**
- `GET /companies/tenant/:tenantId` sigue `@Public()` — es consumido por
  `frontend-core/src/pages/lite/CorteCajaLite.tsx` (plan LITE_CORTE) para resolver qué
  empresas existen bajo un tenantId ANTES de cualquier login, en su flujo de kiosko sin
  sesión. Solo expone `legalName`/`tradeName`/`taxId`/`isActive` — nada financiero ni de
  usuarios — así que cerrarlo rompería ese flujo sin ganar mucho a cambio. Se dejó un
  comentario explícito en el código documentando la decisión.
- `GET /companies` sigue cayendo a `companiesService.findAll()` (todas las empresas de todos
  los tenants) cuando `req.user.tenantId` no está resuelto — en la práctica solo le pasa a
  SOPORTE (`SubscriptionGuard` exige `tenantId` a cualquier otro rol). Es el mismo patrón
  "SOPORTE ve todo por fallback accidental" documentado en el hallazgo transversal #6;
  queda fuera del alcance de esta ronda (no mueve el balance real ni expone datos de un
  tenant específico salvo a SOPORTE, que ya tiene acceso total por rol).

## 3. sucursales — ✅ Funcional

**Código:** `src/branches/branches.controller.ts` + `branches.service.ts`. Tampoco tiene
`@Modulo()` (mismo comentario que empresas).

**Lo que funciona:** alta/listado real, límite de "1 sucursal" en plan LITE
(`branches.service.ts:30-36`).

**✅ Corregido 2026-09-20 (hallazgo #2), mismo patrón que empresas:**
- `POST /branches` aceptaba `companyId` del body sin verificar que esa empresa perteneciera
  al tenant del usuario autenticado. Ahora `create()` valida que la empresa exista y sea del
  `tenantId` del solicitante antes de crear la sucursal.
- `PATCH /branches/:id` y `DELETE /branches/:id` no filtraban por tenant/empresa. Branch no
  tiene columna `tenantId` propia, así que la pertenencia se resuelve vía
  `companyId → Company.tenantId` (mismo patrón que `movements.service.ts` resolviendo vía
  `Bank.tenantId`).
- `GET /branches/company/:companyId` no tenía guard de pertenencia — cualquier usuario
  autenticado podía listar las sucursales de una empresa ajena solo sabiendo su `companyId`.
  Corregido, y se propagó el mismo chequeo a los otros dos call-sites de
  `findByCompany()` dentro de `GET /branches` (query param y header `x-company-id`, ambos
  controlables por el cliente).
- Pruebas: `src/branches/branches.tenant-isolation.spec.ts` — 5/8 casos cross-tenant
  reproducidos como fallo antes del fix, 8/8 pasan después.

**Sigue pendiente (mismo criterio que empresas):** ⚠️ `GET /branches` cae a `findAll()`
(todas las sucursales del sistema) cuando no hay `tenantId`/`companyId` resuelto — mismo
patrón "SOPORTE ve todo por fallback accidental", fuera del alcance de esta ronda.

## 4. usuarios — ⚠️ Parcial (CRUD real + RBAC real, pero con un callejón sin salida confirmado)

**Código:** `src/users/users.controller.ts` + `users.service.ts`. Sin `@Modulo()` (siempre
responde). `findAll()` sí filtra por `tenantId` cuando está presente en el JWT — mismo patrón
"cae a todos si no hay tenantId" que empresas/sucursales, mismo alcance real (solo afecta a
SOPORTE en la práctica).

**Lo que funciona de verdad:**
- Alta/edición/baja de usuarios reales contra la tabla `user`, con hash bcrypt de password y PIN.
- Regla de negocio real (`assertCompanyBranchIfRequired`, `users.service.ts:187-193`): un
  usuario con `roleCode` CAJERO o GERENTE **debe** tener `companyId` y `branchId` — validado
  en `create()` y `update()`.
- `PUT /users/:id/company` está correctamente restringido a SOPORTE (`@Roles('SOPORTE')`).

**✅ Corregido 2026-09-20 (hallazgo transversal #6):** `update()`, `remove()` y
`updateCompany()` no filtraban por tenant — un ADMIN de un tenant podía cambiar rol/
contraseña/estado, reasignar empresa, o borrar un usuario de OTRO tenant si conocía su id.
De paso se corrigió también `GET /users/role/:roleCode`, que tomaba el `tenantId` directo de
un query param sin mirar el JWT (mismo patrón que `findAll()`, no estaba en la redacción
original del hallazgo pero era el mismo hueco). Pruebas:
`src/users/users.tenant-isolation.spec.ts`.

**✅ Corregido 2026-09-22 (hallazgo transversal #8 / recomendación #0) — `GET /users/email/:email`
filtraba el hash bcrypt de la contraseña, público, sin autenticación.** Diagnóstico corregido
en el camino: la entidad `User` ya tenía `password` con `select: false` desde meses antes de
esta auditoría (el hallazgo original decía lo contrario por un error de investigación) — la
causa real era que este endpoint público devolvía crudo el resultado de
`UsersService.findByEmail()`, que a propósito reincluye el hash vía `.addSelect(['user.password'])`
porque `auth.service.ts` lo necesita para `bcrypt.compare()` en el login. Sin consumidor real
en todo el monorepo, se eliminó el endpoint; `findByEmail()` se dejó intacto. Confirmado en
vivo antes (`GET /users/email/admin@demo.com` sin token → 200 con el hash real) y después
(404; login correcto sigue funcionando idéntico, login con password incorrecta sigue
rechazando con 401). Pruebas: `src/users/users.public-email-leak.spec.ts`.

**Hallazgo real, confirmado en vivo (curl contra `localhost:3000`, tenant BUSINESS local,
usuario SOPORTE `admin@estia.com`) — el propio seed deja usuarios en un estado que la API NO
puede reparar:**

1. `seed.ts` crea `gerente@demo.com` y `cajero@demo.com` (roles GERENTE/CAJERO) **sin**
   `companyId` ni `branchId`:
   ```
   SELECT email, "roleCode", "companyId", "branchId" FROM "user"
   WHERE "isActive"=true AND "roleCode" IN ('CAJERO','GERENTE')
     AND ("companyId" IS NULL OR "branchId" IS NULL);
   → gerente@demo.com, cajero@demo.com (ambos NULL/NULL) [+ 2 más con solo un campo faltante]
   ```
2. La migración pendiente `1787818605257-AddCajeroGerenteCompanyBranchCheck.ts` agrega un
   `CHECK` a nivel DB con esa misma regla — y **falla al aplicarse** contra los datos del seed:
   ```
   npm run migration:run
   → error: la restricción check «CHK_user_cajero_gerente_company_branch» de la relación
     «user» es violada por alguna fila
   ```
3. Se intentó reparar SOLO con los endpoints ya existentes de la API (sin SQL directo) y es
   **imposible** para un usuario con ambos campos en NULL:
   - `PUT /users/:id/company` con solo `companyId` → `400 "Los usuarios GERENTE requieren
     empresa y sucursal asignadas"` (valida contra el `branchId` actual, que sigue NULL).
   - `PUT /users/:id` con solo `branchId` → mismo 400 (el endpoint ni siquiera acepta
     `companyId` en el body; solo `updateCompany()` lo acepta, y por separado).
   - No existe un endpoint que reciba `companyId` + `branchId` en la misma llamada.
   - Intentar `isActive:false` para desactivarlo primero (la migración exime a los inactivos)
     también da el mismo 400 — `assertCompanyBranchIfRequired()` (línea 187-193) **no
     considera `isActive`**, a diferencia del `CHECK` de la migración que sí lo exime
     (`"isActive" = false OR roleCode NOT IN (...) OR (...)`) — la regla de la app es más
     estricta que la regla que la propia migración intenta imponer, e inconsistente con ella.
   - Sí es reparable en 4 pasos (bajar roleCode a algo ≠ CAJERO/GERENTE → setear branchId →
     setear companyId vía `/company` → subir roleCode de nuevo), confirmado como ruta válida
     por lectura de código, pero no es una operación que SOPORTE tenga documentada ni un botón
     para hacer — es un rodeo de 4 llamadas API.

**Conclusión:** el módulo funciona para el flujo normal (crear/editar usuarios con datos
completos), pero no tiene una vía soportada para sanear usuarios legacy que quedaron
incompletos — y el propio seed de demo genera usuarios en ese estado exacto.

## 5. configuracion — ✅ Funcional

**Código:** `src/tenant-settings/tenant-settings.controller.ts` + `.service.ts` — es lo que
implementa la "Configuración" del catálogo (marca blanca: logo, colores, tipografía, y
`stockPolicy` que sí es de negocio real: `'BLOQUEAR' | 'PERMITIR_NEGATIVO'` para inventario).
`src/settings/` existe como carpeta pero **solo tiene entidades, ningún controller** — código
muerto o módulo a medio mover (sin relación con este hallazgo, no se tocó).

**Lo que funciona:** upsert real contra `tenant_setting`, con defaults sensatos
(`getDefaults()`), consumido para White Label / apariencia.

**✅ Corregido 2026-09-20 (hallazgo #3):**
- `PUT /tenant-settings/:tenantId` no tenía NINGÚN guard (ni `@Modulo`, ni `@Roles`, ni
  chequeo de que `:tenantId` fuera el propio del usuario). Cualquier usuario autenticado de
  cualquier tenant, incluso un CAJERO, podía sobrescribir el branding y el `stockPolicy` de
  OTRO tenant con solo conocer su UUID. Ahora exige `:tenantId === req.user.tenantId`
  (SOPORTE, sin tenantId en su JWT, conserva acceso total) y `@Roles('ADMIN', 'SOPORTE')`.
- `POST /tenant-settings/:tenantId` llama exactamente al mismo `service.upsert()` con el mismo
  hueco — no estaba en la redacción original del hallazgo (que solo mencionaba PUT) pero se
  cerró igual, porque dejarlo abierto habría sido el mismo bug por otro verbo.
- Pruebas: `src/tenant-settings/tenant-settings.tenant-isolation.spec.ts` — 4/7 casos
  (aislamiento de tenant + metadata de `@Roles()`) fallaban antes del fix en PUT y POST, 7/7
  pasan después.

**Revisado y confirmado intencional (sin cambios):**
- `GET /tenant-settings/:tenantId` sigue `@Public()`. Confirmado con varios consumidores reales
  sin sesión: `App.tsx` (tema global al montar la app, antes de login), `ExecutiveLogin.tsx`
  (Vista Ejecutiva, vía `execPublicApi` explícitamente sin token) y `useLoginConfigStore.ts`.
  Solo expone colores/logo/tipografía/`customCSS` — nada financiero ni de usuarios — así que
  cerrarlo rompería esas pantallas de login. Se dejó un comentario explícito en el código
  documentando la decisión, igual que se hizo con `GET /companies/tenant/:tenantId`.

## Clúster financiero: 6. bancos · 7. movimientos · 8. transferencias · 10. tesoreria · 11. conciliacion

Los 5 códigos del catálogo comparten un solo guard real: `@Modulo('tesoreria')` (hallazgo
transversal #2 — no existen `bancos`/`movimientos`/`transferencias`/`conciliacion` como flags
independientes en ningún guard). Evidencia en vivo (producción, GET, tenant demo):

```
GET /treasury/executive-summary  → totalBalance: 371400, topAccounts con datos reales
                                    (BBVA, Banorte, saldos reales por cuenta)
GET /transfers                    → transferencia real: $25,000 INTERCOMPAÑIA, status PENDIENTE
GET /reconciliation/summary       → {total:0, conciliadas:0, pendientes:0, ...} — CERO facturas
                                    cargadas en TODO el tenant demo (ni siquiera se probó)
```

### 6. bancos — ✅ Funcional

`src/banks/`. CRUD real contra la tabla `bank`, saldos reales. `findOne(id, tenantId)` ya
filtraba por tenant (`banks.service.ts:79-85`).

**✅ Corregido 2026-09-19 (hallazgo #1):** `update()`/`remove()` no recibían `tenantId` del
controller y podían editar/borrar la cuenta de cualquier tenant por id. Ahora ambos exigen
que la cuenta pertenezca a `req.user.tenantId` (mismo criterio que `findOne`, SOPORTE sin
tenantId conserva acceso total). Pruebas de regresión: `src/banks/banks.tenant-isolation.spec.ts`.

### 7. movimientos — ⚠️ Parcial

`src/movements/`. El registro de ingreso/egreso es real: actualiza `bank.balance` de verdad
(`movements.service.ts:46-57`), umbral real de aprobación a partir de $50,000
(`APPROVAL_THRESHOLD`, línea 9) que deja el movimiento en `PENDING_APPROVAL` en vez de aplicar
el saldo de inmediato.

**✅ Corregido 2026-09-19 (hallazgo #1 — era el caso más grave del hallazgo transversal #6):**
`create()`, `approve()`, `reject()` y `findByAccount()` no verificaban que la cuenta/movimiento
pertenecieran al tenant de quien llama — `approve()` sumaba o restaba directamente el
`balance` real de la cuenta bancaria que resultara tener ese `accountId`, sea o no del tenant
del aprobador. Ahora las cuatro operaciones resuelven el tenant dueño de la cuenta (Movement no
tiene columna `tenantId` propia, se resuelve vía `Bank.tenantId`) antes de leer o mutar nada, y
devuelven "no encontrado" (no un 403 explícito) para no filtrar si el recurso existe en otro
tenant. Diagnóstico y regresión: `src/movements/movements.tenant-isolation.spec.ts` — 4/4
casos cross-tenant reproducidos como fallo antes del fix, 8/8 pasan después.

**Sigue pendiente (fuera de esta ronda):** ⚠️ CRUD-por-id sin este mismo fix en otros módulos.

### 8. transferencias — ⚠️ Parcial (queda pendiente la doble implementación)

`src/transfers/` es la vía "oficial": transferencia INTERNA o INTERCOMPAÑIA, con flujo de
autorización real para INTERCOMPAÑIA (`status: PENDIENTE` → `ADMIN` autoriza con
`PUT /transfers/:id/authorize`, restringido por rol — `transfers.controller.ts:48-56`).
Confirmado en vivo (producción): hay una transferencia real de $25,000 en estado PENDIENTE.

**✅ Corregido 2026-09-19 (hallazgo #1):** `authorize()`/`reject()` no verificaban tenant
(`transfers.service.ts:123-202`), y `create()` tampoco validaba que `fromAccountId`/
`toAccountId` fueran del tenant que transfiere. Pruebas: `src/transfers/transfers.tenant-isolation.spec.ts`.

- 🐛 **Sigue pendiente: hay una SEGUNDA implementación de transferencias dentro de
  `treasury.controller.ts`**
  (`POST /treasury/transfers`, `GET /treasury/transfers`) que NO pasa por `TransfersService` ni
  por el flujo de autorización: `TreasuryService.createTransfer()` (línea 576) mueve el dinero
  creando movimientos EXPENSE/INCOME directos, sin crear una fila en la tabla `transfer` — pero
  `TreasuryService.getTransferHistory()` (línea 861) SÍ lee de esa misma tabla `transfer`. Es
  decir: una transferencia creada vía `/treasury/transfers` nunca aparecerá en
  `/treasury/transfers` (GET) ni en `/transfers` (GET), y una transferencia INTERCOMPAÑIA
  creada por esta vía se salta por completo la autorización de ADMIN que sí exige la vía
  "oficial". Dos rutas para la misma operación, con reglas de negocio distintas y sin
  consistencia entre sí.

### 10. tesoreria — ✅ Funcional en su mayoría, con hallazgos concretos
`src/treasury/` (903 líneas) es el módulo más grande del clúster: resumen ejecutivo, flujo de
caja proyectado, posición bancaria, alertas, pagos programados, CxP/CxC, transferencias propias.
- ✅ `getCashFlowForecast()` es una proyección real (no inventada): promedia ingresos/egresos
  reales de los últimos 3 meses (`movement` real) y proyecta día a día sumando pagos programados
  ya conocidos (`treasury.service.ts:179-294`).
- ✅ `getAccountsPayable()` (CxP) es real: se arma desde `purchase` (tabla real de compras a
  proveedores) con fecha de vencimiento, monto pagado/pendiente y días para vencer
  (`treasury.service.ts:635-679`). Notablemente MÁS real que el CxP simulado del dashboard.
- 🔲 **`getAccountsReceivable()` (CxC) NO son cuentas por cobrar reales — son movimientos de
  INCOME ya ocurridos en los últimos 90 días, relabeleados como "por cobrar"**
  (`treasury.service.ts:682-724`: filtra `movement.type = 'INCOME'` histórico, sin ninguna
  noción de "pendiente" o "vencido"). Confirmado en vivo en producción:
  ```
  GET /treasury/accounts-receivable → {"concepto":"Cobro anticipo", "diasHastaCobro": -88, ...}
  ```
  `diasHastaCobro: -88` — "días hasta el cobro" **negativo**, o sea que ya se cobró hace 88
  días. Es un reporte de ingresos históricos disfrazado de cuentas por cobrar pendientes; no
  hay ninguna entidad de "factura de venta"/"cuenta por cobrar" real en el sistema.
- ❌ **`confirmDeposit()` está roto — usa nombres de campo que no existen en la entidad
  `Movement`.** (`treasury.service.ts:875-902`): construye el movimiento con
  `{ bankId, tipo, monto, descripcion, fecha }` y lo fuerza con `as any` para saltarse el
  chequeo de TypeScript — pero `Movement` (`movements/entities/movement.entity.ts`) tiene
  `accountId`, `type`, `amount`, `concept`, `date`, no esos nombres. El `as any` es la prueba
  de que esto se escribió contra un esquema distinto y nunca se corrigió tras el refactor de
  la entidad real. En ejecución esto guarda un `Movement` con `accountId`/`type`/`amount`
  vacíos o nulos (o falla el INSERT si `accountId` es NOT NULL) — el depósito de un turno de
  POS nunca queda realmente registrado como movimiento bancario utilizable. No se ejecutó en
  vivo contra producción por el riesgo de dejar un registro corrupto real; la prueba es
  puramente de código, pero es concluyente (el mismatch de nombres de columna es 1:1).
- ⚠️ Ver arriba: `treasury.service.ts::createTransfer()`/`getTransferHistory()` duplican y
  desincronizan la lógica de `transfers`.

### 11. conciliacion — ⚠️ Parcial (el matching es 100% manual, cero automatización real)
`src/reconciliation/`. El CRUD de facturas (`Invoice`) y el enlace factura↔movimiento
funcionan (`reconciliation.service.ts`), pero:
- 🔲 **No existe ningún algoritmo de conciliación automática.** `manualReconciliation(invoiceId,
  movementId)` (línea 178-184) simplemente enlaza los dos IDs que el cliente mande y marca
  `CONCILIADA` — no compara monto, fecha ni referencia entre la factura y el movimiento. El
  nombre del catálogo ("Conciliación Bancaria") sugiere un match automático o al menos
  sugerido; lo que hay es un enlace manual 1-a-1 elegido por el usuario, disfrazado de
  "conciliación".
- 🔲 `importInvoices()` (línea 194-217) recibe un array de objetos ya parseados — no hay
  ningún parser de estado de cuenta bancario (CSV/OFX/MT940) en todo el backend
  (`grep -ri "ofx\|mt940" src` no da resultados fuera de un match no relacionado en payroll).
  Si el frontend no hace ese parseo client-side, "importar" no es más que pegar JSON a mano.
- ✅ **Corregido 2026-09-20 (hallazgo transversal #6):** `deleteInvoice()`,
  `updateInvoiceStatus()`, `markForManualReview()` y `manualReconciliation()` no filtraban por
  tenant (`Invoice` sí tiene `tenantId` propio). `manualReconciliation()` además enlazaba
  cualquier `movementId` sin verificar que su cuenta bancaria fuera del mismo tenant que la
  factura — ahora se resuelve vía `Bank.tenantId`, mismo patrón que `movements.service.ts`.
  `getAvailableMovements()` tenía el mismo hueco que `movements.service.ts::findByAccount()`
  antes de su fix (hallazgo #1) y se corrigió igual. Pruebas:
  `src/reconciliation/reconciliation.tenant-isolation.spec.ts`.
- 🔲 **Confirmado en vivo en producción: 0 facturas cargadas en el tenant demo completo**
  (`GET /reconciliation/summary` → todo en cero) — a diferencia de dashboard/tesorería/POS que
  sí tienen datos demo abundantes, conciliación parece no haberse usado ni siquiera para la demo.

## 9. reportes — ✅ Funcional

**Código:** `src/reports/reports.controller.ts` + `reports.service.ts`. Correctamente gateado
con `@Modulo('reportes')` a nivel de clase — a diferencia del clúster financiero, este SÍ usa
su propio código de módulo (no comparte `tesoreria`).

**5 reportes, todos calculados de verdad contra `movement` real, agrupando por `category`:**
- `cash-flow`, `balance-by-account`, `category-summary`: sumas/agrupaciones directas.
- `income-statement`: estado de resultados real con utilidad bruta/operativa/EBITDA/neta,
  construido sumando montos por categoría (`VENTAS`, `COSTO_VENTA`, `GASTOS_FIJOS`, etc.) —
  fórmulas contables correctas (`reports.service.ts:175-227`).
- `break-even-point`: punto de equilibrio real — `margenContribucion = 1 - costoVariable/ventas`,
  `puntoEquilibrio = gastosFijos / margenContribucion` (línea 229-267). Fórmula correcta.

**Dependencia de datos, no bug de código:** la precisión de estos reportes depende 100% de que
los movimientos se hayan capturado con la `category` correcta (`VENTAS`, `COSTO_VENTA`, etc.) —
si un movimiento no trae esa categoría exacta, cae en "no clasificado" y no se refleja donde
debería. Es una dependencia de captura, no una falla de este módulo.

**Hallazgo menor:** 🔲 cada una de las 5 llamadas GET escribe en la tabla `report` sin que
nada la lea después (ver hallazgo transversal #7).

## 12. pos — ✅ Funcional (el módulo mejor construido del sistema, pero mal etiquetado en el catálogo)

**Código:** `src/pos/` (10 controllers, ~2000 líneas). Ventas (`sales.*`), turnos
(`shifts.*`), cajeros, mesas, retiros/depósitos, precorte, captura retroactiva.

**Esto es, de lejos, la parte más sólida del backend auditado:**
- `SalesService.create()` (`sales.service.ts:75-170`) hace la venta y el descuento de
  inventario **en una sola transacción de DB** (rollback total si algo falla), valida
  disponibilidad de stock contra `tenantSetting.stockPolicy` ANTES de tocar la BD, maneja
  colisión de folio (código Postgres `23505`) con un mensaje específico en vez de un 500
  genérico, soporta folio generado offline en el cliente (modo sin conexión), y genera
  alertas de insumo bajo automáticamente post-venta sin arriesgar la venta si eso falla.
  Nivel de cuidado notablemente por encima del resto de los módulos auditados.
- Turnos (`shifts.service.ts`): apertura/cierre real, retiros, depósitos, precorte, y una
  captura retroactiva correctamente restringida a `ADMIN`/`SOPORTE` + `@Modulo('corte_retroactivo')`.
- Confirmado en vivo (producción): productos reales con `insumoId` ligado a inventario
  (`GET /pos/products`), turnos reales con horarios de apertura/cierre y totales por forma de
  pago (`GET /pos/shifts`).
- 🐛 Bug menor ya corregido con nota del propio autor: `GET /pos/shifts` vía header
  `x-branch-id` nunca filtraba porque el service espera la clave `sucursalId`, no `branchId`
  — corregido en el controller actual pasando `sucursalId: branchId` explícitamente
  (`shifts.controller.ts:58-67`).

**Hallazgo de catálogo (hallazgo transversal #3):** el código `pos` del catálogo (addon $400)
no gatea NADA de esto — ni ventas, ni turnos, ni cajeros. Cualquier tenant autenticado puede
vender/abrir turno aunque nunca haya contratado el addon POS.

**✅ Corregido 2026-09-20 (hallazgo transversal #6):** `getSale(:id)`, `paySale`, `cancelSale`,
`applyDiscount`, `returnSale` (`SalesService`) y `withdrawal`, `deposit`, `precut`,
`closeShift`, `getShift(:id)`, `getShiftSummary` (`ShiftsService`) no verificaban que el
recurso perteneciera al tenant de quien llama. `Sale` y `Shift` tienen `tenantId` propio, así
que el fix fue directo (mismo patrón que `banks.service.ts`). Pruebas:
`src/pos/pos.tenant-isolation.spec.ts`.

**🆕 Mismo patrón, descubierto al cerrar el punto anterior, NO corregido (ronda aparte):**
`products.service.ts`, `categories.service.ts`, `tables.service.ts` y `areas.service.ts`
(bajo `configuracion_pos`, ver esa sección) tienen el mismo `update(id)`/`delete(id)` sin
filtro de tenant. Ver hallazgo transversal #6 para el detalle de por qué son un poco más de
trabajo (`PosCategory`/`Area` no tienen `tenantId` propio, solo `branchId`).

## 13. configuracion_pos — ⚠️ Parcial (funcional, con el mismo IDOR pendiente que arriba)

**Código:** `pos.controller.ts`, `products.controller.ts`, `categories.controller.ts`,
`tables.controller.ts`, `areas.controller.ts` — todos correctamente bajo
`@Modulo('configuracion_pos')`. CRUD real de catálogo de productos, categorías, mesas y áreas
para el POS. Confirmado en vivo: productos reales con precio, categoría e insumo ligado
(ver `pos` arriba).

**⚠️ Pendiente (hallazgo transversal #6, descubierto 2026-09-20, no corregido en esta
ronda):** `products.service.ts::update/delete`, `categories.service.ts::update/delete`,
`tables.service.ts::update/delete` y `areas.service.ts::update/delete` no filtran por tenant
— mismo patrón que se acaba de cerrar en `sales`/`shifts`. `Product` y `Table` tienen
`tenantId` propio (fix directo); `PosCategory` y `Area` solo tienen `branchId`, así que
requieren resolver tenant vía `branchId → Branch → Company.tenantId` (dos saltos, mismo
patrón usado en `branches.service.ts`).

## 14. integraciones — ❌ No implementado (el más débil de todo el plan BUSINESS)

**Código:** `src/integrations/integrations.controller.ts` + `integrations.service.ts`.
Correctamente gateado (`@Modulo('integraciones')`, con comentario de auditoría de seguridad
explícito confirmando que antes NO lo estaba y se corrigió). Este SÍ tiene buen control de
acceso — el problema no es de seguridad, es que **no hace lo que dice hacer**.

**El catálogo (`INTEGRATION_CATALOG`, `integrations.service.ts:31-104`) ofrece 8 integraciones:**
SAT CFDI (facturación), IMSS IDSE, BBVA, Banorte, CONTPAQi, SoftRestaurant, Parrot POS,
WhatsApp Business — cada una con campos de credenciales (RFC, certificado, API keys, etc.).

**Por qué es ❌, no solo ⚠️:**
- `testConnection()` (línea 167-175) **no llama a ningún servicio externo real**. Solo revisa
  si el registro local tiene `isActive = true` y devuelve `{success: true, message: "Conexión
  exitosa"}` incondicionalmente, actualizando `lastSync` como si de verdad hubiera sincronizado.
- `grep -rn "axios\|HttpService\|fetch(" src/integrations src/hr src/payroll` → **cero
  resultados**. No existe ningún cliente HTTP hacia BBVA, Banorte, SAT, IMSS, CONTPAQi,
  SoftRestaurant o Parrot en todo el backend. `activate()`/`updateConfig()` únicamente
  guardan credenciales en columnas de texto plano, sin ningún proceso que las use después.
- Coincide exactamente con `PENDIENTES.md` del propio repo, sección "🔵 INTEGRACIONES (fase 4)":
  APIs bancarias, ContPAQ, SAP, SoftRestaurant, Parrot, IDSE/INFONAVIT/SUA — **todos sin marcar**,
  reconocidos como pendientes por el propio equipo.
- Confirmado en vivo en producción, tenant demo BUSINESS (el que más datos tiene de todos):
  ```
  GET /integrations → las 8 integraciones, TODAS con "isActive": false, "status": "DISCONNECTED"
  ```
  Ni siquiera en la demo insignia hay una sola integración activada — consistente con que la
  función "activar" no conecta con nada real.

**Conclusión:** es una pantalla de configuración bien construida (CRUD de credenciales, buen
control de acceso) alrededor de una funcionalidad que no existe. El addon de $500/mes del
catálogo no tiene ninguna integración real detrás en este momento.

## Clúster de operaciones: 15. proveedores · 16. compras · 17. costos

### 15. proveedores — ⚠️ Parcial
`src/suppliers/`. CRUD real, correctamente gateado (`@Modulo('proveedores')`), y con el mismo
fix de seguridad de prioridad-JWT-sobre-query-param que sí se aplicó aquí (a diferencia de
`companies`/`branches`) — comentario explícito "Auditoría de seguridad (GoodsHabits)" en
`suppliers.controller.ts:18-21`.
- 🔲 **`GET /suppliers/:id/purchases` es un stub que siempre devuelve `[]`**
  (`suppliers.controller.ts:33-37`), con un comentario literal: *"Por ahora retorna un array
  vacío, se implementará cuando se cree el módulo de compras"* — pero el módulo de compras
  **ya existe** (`src/purchases/`, 278 líneas, con órdenes/facturas/pagos reales). El
  historial de compras por proveedor en la ficha del proveedor nunca se conectó al módulo real
  después de construirlo — queda como código muerto/olvidado, no como limitación real de datos.

### 16. compras — ✅ Funcional
`src/purchases/`. Ciclo de vida real y bastante completo: orden de compra → enviar → recibir
(con conversión de presentación→consumo, ver `costos` abajo) o cancelar (con flujo de
solicitud + aprobación en dos pasos, corregido recientemente para exigir rol
`ADMIN`/`SOPORTE` en la aprobación — commit `56bfbdf`, confirmado en el propio código:
`purchases.controller.ts:62-73`) → factura → **registrar pago real, que crea un `Movement`
real de tipo EXPENSE en la cuenta bancaria** (`purchases.service.ts:200-232`, con
`createdBy` persistido desde el fix de seguridad reciente). Cuentas por pagar reales
alimentando `treasury.getAccountsPayable()` (ver clúster financiero). Sin hallazgos mayores
más allá del mismo patrón IDOR transversal en operaciones por `:id`.

### 17. costos — ✅ Funcional (con un bug crítico recién corregido, documentado por el propio equipo)
`src/costs/` (747 líneas): insumos, familias, recetas, almacenes, conteos físicos,
justificables. El propio historial de git documenta un hallazgo real de auditoría anterior:
> commit `2ecec3f` (4-sep-2026): *"el módulo Costos del ERP ya tenía los campos
> (unidadMedida, presentacionCompra, factorConversion, cantidadPresentacion) pero ninguno
> calculaba nada — comprar '1 caja de 24' solo sumaba +1 al stock, no +24, y costoUnitario
> era siempre captura manual."*

Confirmado que el fix está aplicado en el código actual:
- `costs.service.ts:78-114` — `calcularCostoUnitario(precioCompra, factorConversion, merma)`
  ahora calcula el costo unitario real (portado de un sistema hermano en producción,
  `estia-costos-api`).
- `purchases.service.ts:176-180` — al recibir una orden de compra, el stock se incrementa
  `cantidad * factorConversion`, no solo `cantidad` — el bug original ya no reproduce.

Es un buen ejemplo de que la auditoría anterior sí generó una corrección real y verificable,
no solo un hallazgo documentado y olvidado.

## 18. pacientes — ❌ No incluido en BUSINESS (decisión de producto confirmada 2026-09-20)

**Código:** `src/patients/` — CRUD de pacientes + consultas/visitas, con KPIs reales
(ingresos, pendiente de cobro, ticket promedio, nuevos vs. recurrentes, desglose por doctor y
por método de pago — `patients.service.ts:57-93`). El código en sí **es funcional y de buena
calidad**, no es un stub — este hallazgo nunca fue sobre la calidad del código.

**Hallazgo original (hallazgo transversal #4):** `pacientes` estaba en `PLAN_MODULES.BUSINESS`
pero era prácticamente inactivable para un tenant BUSINESS típico —
`src/config/module-giro-requirements.config.ts` exige giro `medico_dental`/`medico_general`, y
un comentario del propio equipo en `giros.config.ts` confirmaba: *"hoy solo 'medico_dental'
tiene un tenant real en uso (Riova)"* — de todos los tenants del sistema, solo UNO usa esto de
verdad. Confirmado en vivo en su momento: `GET /patients` (tenant demo BUSINESS, producción) →
403 "Módulo 'pacientes' no disponible en tu plan".

**✅ Resuelto 2026-09-20 — decisión de producto de Miguel, no un fix de código:** el bloqueo
por giro es correcto como comportamiento; lo que estaba mal era prometer el módulo en el
catálogo estándar de BUSINESS sin decirlo. Se quitó `pacientes` de la constante `BUSINESS` en
`PLAN_MODULES` (`src/seed/seed.ts`) — sigue en `BASIC` sin tocar, fuera del alcance de esta
decisión — y se documentó explícitamente en `module-giro-requirements.config.ts` que esto es
una decisión de producto confirmada, no solo una restricción técnica incidental.

**Lo que NO cambió:** el mecanismo de activación por giro sigue exactamente igual —
`pacientes` sigue siendo un módulo real, activable automáticamente en cuanto el giro de un
tenant califica (vía cualquier plan que sí lo liste, o a mano por SOPORTE vía
`activateModule()`, como ya está activado para "Riova"). Es y siempre fue un módulo exclusivo
de giro médico/dental; ya no se anuncia además como si fuera parte del paquete estándar de
BUSINESS.

**Nota de alcance:** la decisión y el cambio se limitaron explícitamente a `PLAN_MODULES.
BUSINESS`. `pacientes` sigue listado en `PLAN_MODULES.BASIC` con el mismo problema de fondo
(un BASIC no-médico tampoco puede activarlo) — no se tocó porque no fue parte de lo pedido;
si se quiere aplicar el mismo criterio ahí, es una decisión aparte.

---

## Recomendaciones prioritarias (orden sugerido de arreglo)

0. **✅ CERRADO 2026-09-22 — `GET /users/email/:email` filtraba el hash bcrypt de la
   contraseña, público, sin autenticación** (hallazgo transversal #8). Diagnóstico corregido
   en el camino: la entidad `User` ya tenía `password` con `select: false` desde antes de esta
   auditoría (no hacía falta tocarla); la causa real era el endpoint público reexponiendo una
   consulta interna (`UsersService.findByEmail()`) que a propósito reincluye el hash para el
   login. Se eliminó el endpoint (sin consumidor real, grep limpio en todo el monorepo); el
   método del service se dejó intacto porque `auth.service.ts` lo necesita. Login verificado
   en vivo antes y después del fix, sin cambios de comportamiento. Ver sección `usuarios` y
   `src/users/users.public-email-leak.spec.ts`.
1. **✅ CERRADO 2026-09-19 — Cerrar el IDOR sistémico con impacto financiero directo**
   (`movements.service.ts::create/approve/reject/findByAccount`,
   `transfers.service.ts::create/authorize/reject`, `banks.service.ts::update/remove`). Ver
   detalle en las secciones `bancos`/`movimientos`/`transferencias` y las pruebas nuevas
   (`*.tenant-isolation.spec.ts` en esos tres módulos).
2. **✅ CERRADO 2026-09-20 — Aplicar el mismo fix de "JWT antes que body/query" a
   `companies` y `branches`** (`create`, `update`, `remove`, y `findOne`/`findByCompany`). Ver
   secciones `empresas`/`sucursales` y `src/{companies,branches}/*.tenant-isolation.spec.ts`.
3. **✅ CERRADO 2026-09-20 — Poner un guard mínimo en `tenant-settings.controller.ts`**
   (dueño del tenant + `@Roles('ADMIN', 'SOPORTE')`, aplicado a PUT y POST). Ver sección
   `configuracion` y `src/tenant-settings/tenant-settings.tenant-isolation.spec.ts`.
3b. **✅ CERRADO 2026-09-20 — Resto del hallazgo transversal #6: `users`, `reconciliation`,
   `pos` (sales/shifts).** Ver secciones `usuarios`/`conciliacion`/`pos` y
   `src/{users,reconciliation,pos}/*.tenant-isolation.spec.ts`. **Sigue abierto:** el mismo
   patrón en `configuracion_pos` (`products`/`categories`/`tables`/`areas`) — descubierto al
   cerrar este ítem, no corregido todavía, ver esa sección.
4. **⚠️ Arreglar `confirmDeposit()` en `treasury.service.ts`** — usa nombres de columna que no
   existen en `Movement`; el depósito de cierre de turno de POS no se está registrando bien.
5. **⚠️ Decidir qué hacer con `integraciones`**: o se construye al menos una integración real
   (o se retira temporalmente del catálogo/plan BUSINESS y de `testConnection()` se quita el
   `success: true` fijo), porque hoy vende algo que no existe.
6. **✅ CERRADO 2026-09-20 — Decidir el destino de `pacientes` dentro de BUSINESS**: Miguel
   confirmó que el bloqueo por giro es el comportamiento correcto; se quitó `pacientes` de
   `PLAN_MODULES.BUSINESS` y se documentó como decisión de producto en
   `module-giro-requirements.config.ts`. Sigue en `PLAN_MODULES.BASIC` con el mismo problema
   de fondo, sin tocar (fuera de lo pedido). Ver sección `pacientes`.
7. **Unificar transferencias**: decidir si `treasury.createTransfer()` se elimina o se hace
   pasar por `TransfersService` — hoy son dos caminos con reglas distintas para lo mismo.
8. **Conectar `GET /suppliers/:id/purchases`** al módulo `purchases` real (ya existe, solo
   falta la consulta).
9. Housekeeping menor: quitar o darle uso real a `dashboard_metric` y `report` (hallazgo
   transversal #7), y correr `npm run migration:run` en el entorno de desarrollo local para
   eliminar el drift de 10 migraciones detectado durante esta auditoría.
10. **✅ CERRADO 2026-09-25 — Unificar la caminata de `reemplazadoPorId` (con detección de
    ciclos) duplicada TRIPLICADA en `sales.service.ts::resolveActiveInsumo()`,
    `costs.service.ts::costoUnitarioInsumo()` y `products.service.ts::resolveActiveInsumoSafe()`.**
    Se extrajo a `src/costs/insumo-resolution.ts` — función pura (no `@Injectable()`, cero
    acoplamiento de módulo Nest entre `pos/` y `costs/`), recibe el `EntityManager` como
    parámetro explícito (cada caller pasa el manager transaccional activo o uno
    no-transaccional según necesite) y devuelve un resultado tipado en vez de lanzar, para que
    cada uno de los tres callers preserve exactamente su propio contrato de error (venta:
    `BadRequestException`/`Error`; costos: `Error` genérico; listado de productos del POS:
    nunca lanza, `logger.warn()` + `null`). Verificado con specs nuevos por los tres call
    sites, corridos primero contra la implementación original y de nuevo contra la unificada
    — mismo comportamiento observable exacto en ambos casos.
    **Pendiente para una ronda aparte, NO corregido en esta:** al diagnosticar esto se
    encontró que `PurchasesService.createPurchase()` (`src/purchases/purchases.service.ts`)
    llama a `CostsService.updateInsumo()` para incrementar `stockActual` al recibir una
    factura, **sin ningún `EntityManager` compartido con el `save()` de la compra** — a
    diferencia de `SalesService.create()`, que sí envuelve venta + descuento de inventario en
    una sola transacción (`this.dataSource.transaction(...)`). Un crash a medio camino podría
    dejar la compra guardada sin que el stock se incrementara, o viceversa. No se toca en esta
    ronda — el alcance aprobado fue solo la unificación de `resolveActiveInsumo`, no este
    hueco de atomicidad en compras.

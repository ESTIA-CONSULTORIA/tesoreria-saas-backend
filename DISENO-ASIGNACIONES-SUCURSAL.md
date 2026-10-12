# Diseño — Asignaciones de sucursal y rol por sucursal (Fase 2)

Estado: **diseño, sin implementar y sin SQL ejecutado.** Espera visto bueno.
Base: Fase 1 (`feat/sucursal-efectiva`) ya centraliza la sucursal efectiva en `src/common/sucursal-efectiva.ts`.

## 1. Modelo

| Concepto | Dónde vive | Notas |
|---|---|---|
| Sucursal base y rol base | `user.branchId`, `user.roleId` (ya existen) | Lo que hoy viaja en el JWT. No cambia. |
| Asignación adicional | `usuario_sucursal_asignaciones` (nueva) | sucursal, rol **en esa sucursal**, vigencia opcional, motivo, otorgante, revocación |
| ADMIN / dueño sin sucursal | `user.branchId = NULL` | Ve **todas** las sucursales de su tenant con su rol base (ADMIN). No necesita asignaciones. |

SQL completo, sin ejecutar: `asignaciones-sucursal-migration.sql` (tabla, 3 índices, 5 CHECK, 3 FK, columnas de auditoría, índice de turno único).

Restricciones clave de la tabla:

- Una asignación **viva** por (usuario, sucursal): índice único parcial `WHERE revocadaAt IS NULL`. Cambiar = revocar y crear otra (queda historial).
- `otorgadoPor <> userId`: nadie se auto-otorga. `vigenteHasta > vigenteDesde`. `motivo` obligatorio.
- Revocar es marcar (`revocadaAt`, `revocadaPor`), nunca borrar: ventas y turnos la referencian por `asignacionId`.
- `tenantId` en la fila y **validado en la aplicación**: usuario, sucursal y rol del mismo tenant (el rol es global, pero el otorgante solo puede dar roles del catálogo POS permitidos).

## 2. Resolución del rol y la sucursal efectivos (en cada petición)

Entrada: token (usuario, tenant, sucursal base, rol base) + header `X-Branch-Id` opcional.

1. **Conjunto permitido** = sucursal base (rol base) ∪ asignaciones vivas con `now()` dentro de la vigencia y no revocadas. ADMIN/dueño sin sucursal: todas las del tenant (rol base).
2. **Sucursal efectiva**: el header si viene; si no, la base (ADMIN sin header: todas, como hoy).
3. Si el header **no está en el conjunto permitido → 403** (hoy en Fase 1 se ignora en lecturas; en Fase 2 pasa a 403 porque ya existe qué elegir).
4. **Rol efectivo** = rol de la asignación de esa sucursal, o el rol base si es la base. **Nunca** `max(base, asignación)`: en la sucursal de apoyo manda solo el rol de esa asignación.
5. Se inyecta en `req.user`: `roleCode` (efectivo, así `@Roles`, `TOPE_DESCUENTO_PCT`, `ROLES_CORTESIA`, etc. no cambian), `branchId` (efectivo), `baseRoleCode`, `asignacionId`.

**Vigencia por petición:** una consulta indexada por usuario y petición (`WHERE userId=? AND revocadaAt IS NULL AND (vigenteDesde IS NULL OR vigenteDesde<=now()) AND (vigenteHasta IS NULL OR vigenteHasta>now())`). Las asignaciones **no van en el JWT**: revocar o vencer surte efecto en la siguiente petición, sin esperar el refresco del token. Costo: 1 consulta liviana por petición; se omite para quien no tiene asignaciones (flag en el usuario o caché por petición).

## 3. Un turno abierto por usuario

- Índice único parcial `("tenantId","cajero") WHERE status='ABIERTO'` (ya en el SQL). Hoy **no existe**: un cajero podría tener turnos abiertos en dos sucursales a la vez.
- Antes de crearlo hay que revisar duplicados existentes (consulta en el SQL); si hay, se cierran a mano primero.
- Abrir turno en una sucursal de apoyo exige asignación vigente; el turno guarda `rolEfectivo` y `asignacionId`.

## 4. Selector de sucursal

- **ERP:** `GET /auth/me/sucursales` devuelve las permitidas con su rol efectivo en cada una. El selector del TopBar solo lista esas; al elegir, el frontend manda `X-Branch-Id`. Cambiar de sucursal con turno abierto en otra se avisa (el turno sigue siendo de la primera).
- **NIP / POS Lite:** el NIP identifica al usuario (único por tenant). Tras validarlo, si tiene más de una sucursal permitida la respuesta incluye la lista y el cajero elige; el token de la sesión NIP **fija** la sucursal elegida (no hay header que cambie a mitad de turno). Para cambiar, vuelve a entrar con NIP.
- El limitador de NIP sigue por (tenant, usuario, IP): tener varias sucursales **no** multiplica los intentos.

## 5. Auditoría de sucursal y rol efectivos

| Dónde | Qué se guarda | Fuente |
|---|---|---|
| `sale` (venta) | `sucursalId` (ya existe), `rolEfectivo`, `asignacionId` | servidor, desde `req.user` |
| `shift` (turno) | `sucursalId` (ya existe), `rolEfectivo`, `asignacionId` | servidor |
| devolución | `devolucionRolEfectivo`, `devolucionAsignacionId` (+ `sucursalId` de la venta) | servidor |

Todas nullable: lo histórico queda NULL = rol y sucursal base. El cliente nunca las envía.

## 6. Offline

- Cada venta en cola lleva `sucursalId` y `clientTimestamp` (ya existen). Se añade `asignacionId` **informativo**.
- Al sincronizar, el servidor evalúa la asignación **a la hora del evento** (`clientTimestamp`), no a la de sincronizar: una asignación que estaba vigente cuando se vendió es válida aunque ya venciera o se revocara después. Si no lo estaba, la venta va a `offline-fallidas` (cola que ya existe) para revisión, no se descarta.
- Se conserva la ventana actual de 48 h del `clientTimestamp`.
- El rol efectivo para topes (descuento, cortesía) se recalcula con el rol de **esa** asignación; si el descuento excede el tope, ocurre lo de hoy (se rechaza).

## 7. Casos límite

| Caso | Regla propuesta |
|---|---|
| **Rol inferior en la sucursal de apoyo** (GERENTE base, CAJERO en apoyo) | Rige el rol de la asignación: tope de descuento y permisos de CAJERO. El rol base no "sube" ahí. |
| **Rol superior en apoyo** (CAJERO base, GERENTE en apoyo) | Permitido solo si el otorgante tiene ese rol o superior en esa sucursal; nunca se puede otorgar un rol mayor al propio. |
| **Asignación vence con turno abierto** | El turno **no se cierra solo**. Con la asignación vencida solo se permite cerrar/precorte de ese turno y cobrar lo ya capturado; no abrir cuentas ni vender. Un GERENTE/ADMIN puede forzar el cierre. *(Decisión a confirmar.)* |
| **Asignación revocada con turno abierto** | Igual que vencida, de inmediato. |
| **Usuario con NIP** | NIP único por usuario; el selector aparece tras validarlo; la sesión fija sucursal y rol efectivos. |
| **Asignar la sucursal base** | Rechazado (ya la tiene). |
| **Cambia la sucursal base del usuario** | Sus asignaciones se conservan; la nueva base no puede coincidir con una asignación viva (se revoca). |
| **Auto-otorgamiento** | Imposible (CHECK). Solo ADMIN/dueño, o GERENTE de la **sucursal destino** para roles ≤ CAJERO/CAPITAN/MESERO/RECEPCION. *(A confirmar.)* |
| **SOPORTE** | No participa: no tiene sucursal ni asignaciones. |
| **Dos asignaciones a la misma sucursal** | Imposible (índice único parcial). |
| **Aislamiento de tenant** | Usuario, sucursal y rol validados contra el tenant del otorgante; header de otro tenant = 403. |
| **Tenants sin asignaciones** | Comportamiento de Fase 1, sin cambios. |

## 8. Tamaño y riesgos

**Tamaño: L.**

| Pieza | Tamaño |
|---|---|
| Migración (tabla, auditoría, índice de turno) | S |
| Resolver efectivo + middleware + `GET /auth/me/sucursales` | M |
| CRUD de asignaciones con permisos y auditoría | M |
| Cableado de rol efectivo a ventas/turnos/devoluciones/offline | M |
| Selector en ERP + flujo NIP + avisos | M |
| Specs (rol × sucursal × vigencia × offline) | M |

**Riesgos de dinero**

- Topes de descuento y cortesías con el rol equivocado en la sucursal de apoyo (sube el tope por usar el rol base). Mitigación: rol efectivo único, specs por rol y sucursal.
- Corte Z atribuido a la sucursal incorrecta si el selector cambia con turno abierto. Mitigación: el turno fija su sucursal; ventas heredan la del turno.
- Dos turnos abiertos del mismo usuario → efectivo esperado mal calculado. Mitigación: índice único (previo: limpiar duplicados).
- Devolución hecha con un rol que no la permite en esa sucursal.
- Ventas offline de asignaciones vencidas: se desvían a revisión, no se pierden ni se aceptan a ciegas.

**Riesgos de seguridad**

- Escalada de privilegios por auto-otorgamiento o por otorgar un rol mayor al propio.
- Datos de otra sucursal por header manipulado (403 en Fase 2).
- Token con asignaciones obsoletas: por eso no van en el JWT.
- Fuga entre tenants por FKs mal validadas (validación en aplicación + índices por tenant).
- Fuerza bruta de NIP multiplicada por sucursales: el limitador sigue por usuario.

## 9. Decisiones que necesito de ti

1. Asignación vencida con turno abierto: ¿solo cerrar (propuesto) o permitir seguir vendiendo hasta el cierre?
2. ¿Quién puede otorgar? Propuesta: ADMIN/dueño siempre; GERENTE de la sucursal destino solo roles operativos.
3. En la sucursal de apoyo, ¿se permite un rol **superior** al base? (propuesto: sí, solo si el otorgante lo tiene).
4. Selector con NIP: ¿sesión fija (propuesto) o permitir cambiar sin re-ingresar NIP?

# Checklist de alta de cliente — gimnasio (membresías, cafetería y tienda)

Mismo formato que `CHECKLIST-ALTA-CLIENTE.md`: pasos en orden; cada uno dice **quién** lo hace y si va por **interfaz**, **API** o **SQL**.
Las canchas **no** se reservan aquí (el cliente usa Playtomic): este sistema cobra y controla **membresías**, y vende en el POS
(bebidas, servicios, tienda).

Convenciones: `$API` = `https://api.estiaconsultoria.com/api/v1`. `TENANT` = id del tenant del paso 1. `SOPORTE` = `admin@estia.com`.

---

## 0. Antes de empezar (una vez por base de datos, no por cliente)

Estos SQL están **sin ejecutar**; cada uno termina en `ROLLBACK` (revisa los SELECT y cámbialo a `COMMIT`). Orden:

| # | Archivo | Qué hace |
|---|---|---|
| 1 | `iva-producto-migration.sql` | Columna `product."tasaIva"` (IVA propio por producto). Nullable: nada cambia hasta que se use. |
| 2 | `membresias-migration.sql` | 4 tablas: `socios`, `planes_membresia`, `membresias`, `checkins_socios`. |
| 3 | `roles-recepcion-prod.sql` | Rol global **RECEPCION**. |
| 4 | `gimnasio-modulos.sql` | Módulo `membresias` en el catálogo y en los planes BUSINESS y ENTERPRISE. |

- [ ] Los 4 corridos y verificados (`COMMIT`) **antes** de desplegar el código de IVA configurable y de membresías.
- [ ] Variable `APP_TIMEZONE` en Railway si el negocio no está en Tijuana (default `America/Tijuana`). Decide qué es "hoy" para las vigencias.

## 1. Crear el tenant (SOPORTE)

**Interfaz:** panel SOPORTE → Gestión de clientes. **API:** `POST $API/tenants`.

| Campo | Valor |
|---|---|
| `legalName` / `tradeName` | Razón social y nombre comercial |
| `giro` | **`gimnasio`** |
| `plan` | **`BUSINESS`** |
| `email` + `password` + `ownerName` | El **ADMIN** del cliente |
| `slug` | Corto y único |

## 2. Módulos (SOPORTE)

**Verifica** (interfaz: módulos del cliente; API: `GET $API/modules/tenant/TENANT`). Deben estar activos: `pos`, `configuracion_pos`,
`membresias`, `usuarios`, `empresas`, `sucursales`, `reportes`. `costos` solo si controla insumos de cafetería.

- `membresias` solo existe en tenants de giro `gimnasio` (en otro giro el sistema lo rechaza).
- Si falta: `POST $API/modules/tenant/TENANT/activate` con `{"moduleCode":"membresias"}` (o re-inicializar: `.../init` con `{"planCode":"BUSINESS"}`).
- **No existe módulo de reservas.**

## 3. Activar la capacidad `membresias` (API o SQL — **no hay interfaz**)

Sin ella el POS no cobra membresías ni aplica beneficios.

```
PUT $API/tenant-settings/TENANT        (sesión del ADMIN del tenant o SOPORTE)
{ "posCapabilities": { "membresias": true, "venta_de_servicio": true } }
```

`venta_de_servicio` evita que clases o servicios descuenten inventario; actívala si vendes servicios además de membresías.

**SQL alternativa:**

```sql
UPDATE tenant_setting
SET "posCapabilities" = (COALESCE("posCapabilities"::jsonb, '{}'::jsonb) || '{"membresias": true, "venta_de_servicio": true}'::jsonb)::json
WHERE "tenantId" = 'TENANT';
```

**Verifica:** `GET $API/tenant-settings/TENANT` → `posCapabilities.membresias === true`.

## 4. IVA y precios — cómo los captura el cliente (ADMIN, interfaz)

**Pantalla:** POS → Parámetros → **Impuestos** (solo ADMIN). **API:** `PUT $API/tenant-settings/TENANT`.

| Qué | Opciones | Efecto |
|---|---|---|
| **IVA por defecto del negocio** | 16 % · 8 % · 0 % · Exento | Aplica a todo producto y plan sin tasa propia. Default: 16 %. |
| **Los precios ya incluyen IVA** | sí / no | **No** (default): el sistema suma el IVA al precio. **Sí**: el precio es el que paga el cliente y el sistema desglosa el IVA. |

Decídelo **antes de cargar precios**: cambiarlo después cambia lo que cobra el sistema en las ventas nuevas (las ya hechas
conservan su tasa y su desglose; una devolución regresa exactamente lo que se cobró).

Ejemplo con un plan de **$500**:

| Configuración | Cliente paga | Base | IVA |
|---|---|---|---|
| 16 %, precios sin IVA | **$580.00** | $500.00 | $80.00 |
| 16 %, precios con IVA incluido | **$500.00** | $431.03 | $68.97 |
| 8 %, precios sin IVA | **$540.00** | $500.00 | $40.00 |
| Exento | **$500.00** | $500.00 | $0.00 |

**IVA propio de un producto o de un plan** (p. ej. una clase exenta): campo **IVA de este producto** (POS → Productos) o **IVA de este
plan**; vacío = usa el del negocio. En la importación CSV, columna `iva` (`16`, `8`, `0`, `EXENTO`).

## 5. Sucursales y usuarios por rol (ADMIN, interfaz)

**Interfaz:** Sucursales y Usuarios. Todos los roles operativos **exigen empresa y sucursal**.

| Rol | Entra con | Qué hace en el gimnasio |
|---|---|---|
| ADMIN | correo + contraseña | Todo; configura IVA, planes y reportes |
| GERENTE | correo + contraseña | Planes, reportes, cancelar membresías, **cortesías**, descuentos sin tope |
| RECEPCION | NIP (4 dígitos) o correo | Socios, **cobrar y renovar** membresías, congelar, **check-in**, alertas. Descuento de beneficio hasta **10 %**. Sin cortesías, sin planes ni reportes de ingresos |
| CAJERO | NIP o correo | Ventas de cafetería/tienda; descuento hasta 10 %. No ve membresías |

- El **NIP** es la contraseña de 4 dígitos y debe ser **único en el negocio** entre CAJERO, MESERO, CAPITAN y RECEPCION.
- Deja al ADMIN **sin sucursal propia** (si no, todo usuario que cree hereda la suya).

## 6. Categorías y productos de cafetería/tienda (GERENTE o ADMIN)

1. **Categorías** — **API** `POST $API/pos/categories` `{"name":"Bebidas","branchId":"<sucursal>"}`. Crea al menos **Bebidas** y
   **Servicios** (y las que quiera): **la categoría es el concepto del reporte de ingresos** (paso 12).
2. **Productos** — POS → importar CSV (interfaz, con la sucursal activa). Columnas: `nombre,categoria,precio,impuesto,descripcion,estacion,iva`.
   `categoria` debe coincidir con una categoría **de esa sucursal**; `precio` según la regla del paso 4; `iva` opcional.
   Alta individual: POS → Productos → Nuevo (guarda en el servidor).
3. Inventario solo si controla insumos (módulo Costos); si no, `stockPolicy` = `PERMITIR_NEGATIVO` (default).

## 7. Planes de membresía (ADMIN o GERENTE, interfaz)

**Pantalla:** Membresías → **Planes** → *Nuevo plan*. Todo lo captura el cliente:

| Campo | Qué es |
|---|---|
| Nombre | "Mensual", "Trimestral", "Estudiante"… (único por negocio) |
| Precio | Según el paso 4 (sin IVA o con IVA incluido) |
| Cada / Periodo | Duración: días, meses o años. Los periodos seguidos no se traslapan (un mes desde el 5 vence el 4) |
| IVA de este plan | Vacío = el del negocio |
| Días que puede congelar | 0 = el plan no permite congelar |
| Beneficio: % de descuento | Descuento en compras del POS del socio vigente. **Con tope por rol**: RECEPCION y CAJERO 10 %, CAPITAN 20 %, GERENTE y ADMIN sin tope. Si el beneficio rebasa el tope del que cobra, el sistema lo rechaza (403) y pide a un gerente |
| Otros beneficios | Texto libre, uno por renglón (no afecta cálculos) |
| Plan activo | Desactivarlo impide cobrarlo; lo ya vendido no cambia |

- Cada plan crea sola su "Membresía: <nombre>" en el catálogo del POS (servicio, sin inventario). **No la vendas desde el POS normal
  sin socio**: el sistema lo rechaza.
- Cambiar el precio de un plan **no** cambia lo que ya pagaron los socios.

## 8. Alertas (ADMIN o GERENTE, interfaz)

**Pantalla:** Membresías → **Alertas** → *Configurar alertas*: días de anticipación para "por vencer" (default 7) y días de gracia
antes de contar a un socio en **mora** (default 0). **API:** `PUT $API/tenant-settings/TENANT` `{"membresiasDiasAviso":7,"membresiasDiasGracia":0}`.

## 9. Alta de socios y primera membresía (RECEPCION, interfaz)

1. **Turno abierto:** el cajero o la recepción abre turno en el POS (fondo inicial). Sin turno no se puede cobrar.
2. **Membresías → Socios → + Nuevo socio:** nombre y teléfono; número consecutivo automático (o el que ya traían); **NIP** de 4 a 6 dígitos
   para entrar (opcional; único por negocio).
3. **Cobrar:** en la fila del socio → *Cobrar* → elige plan y forma de pago. El sistema muestra el total con IVA y lo **confirma el
   servidor**; la vigencia empieza hoy. Es una venta normal del POS: entra al corte Z.
4. **Renovar:** el mismo botón. Si aún tiene vigencia, el nuevo periodo empieza al día siguiente de su fin (no pierde ni regala días).

## 10. Operación diaria

- **Check-in:** Membresías → Check-in, por número de socio o NIP. Pantalla verde = entra (con aviso si vence pronto); roja = no entra y
  dice por qué (vencida, congelada, aún no empieza, sin membresía, baja). Cada intento queda registrado.
- **Congelar / descongelar:** fila del socio. Los días en pausa se agregan al final (hasta el máximo del plan).
- **Beneficio en el POS:** en el ticket, *N.º de socio* → *Aplicar*: el descuento del plan se aplica a lo que **no** es la membresía.
- **Devolución:** POS → devolver la venta de la membresía **cancela ese periodo** (queda el rastro). Solo GERENTE o ADMIN (política de devoluciones).
- **Cancelar sin devolver dinero:** ficha del socio → *Cancelar una membresía* (ADMIN o GERENTE, con motivo).

## 11. Prueba de aceptación (con números)

Con IVA 16 % sin incluir y un plan "Mensual" de $500 con 10 % de beneficio:

| Paso | Resultado esperado |
|---|---|
| Cobrar "Mensual" a un socio nuevo, efectivo | **$580.00** (IVA $80); vigencia del día de hoy a un día antes de cumplir el mes |
| Renovar al día siguiente | **$580.00**; nuevo periodo empieza al terminar el anterior |
| Venta de 2 agua × $50 con el N.º de socio | Descuento 10 % → subtotal 100, desc. 10, IVA 14.40, total **$104.40** |
| Mismo caso con un plan de 15 % cobrando RECEPCION | **403** "puede dar hasta 10 %" |
| Cobrar como **cortesía** con RECEPCION o CAJERO | **403**; GERENTE sí |
| Check-in con membresía vencida | **Denegado**, con la fecha y los días de vencida |
| Devolución de la venta de la membresía | Periodo **CANCELADO**; check-in denegado |
| Corte Z | La membresía aparece en efectivo/tarjeta y en `iva.porTasa` |

## 12. Reportes (ADMIN o GERENTE, interfaz)

**Membresías → Reportes:**
- **Activas, por vencer, vencidas, congeladas y sin membresía**: tarjetas con conteo y listado (clic en la tarjeta).
- **Ingresos por concepto** (rango de fechas): **Membresías**, y para lo demás la **categoría** del producto (Bebidas, Servicios…);
  base sin IVA, IVA y total; las devoluciones restan.
  Un producto sin categoría cae en **Servicios** si es servicio, o en **Sin categoría**.
- Corte Z: `iva` con el IVA trasladado por tasa del turno.

## 13. Cierre del alta

- [ ] `POST $API/auth/login` sin credenciales → **401**.
- [ ] Ventas y socios de prueba identificados; devoluciones hechas; turno de prueba cerrado.
- [ ] Entregar al cliente: usuario ADMIN, `slug`, NIP de cada rol, y la regla de IVA elegida (paso 4).
- [ ] `PATCH $API/tenants/TENANT/onboard` al terminar el asistente.

### Resumen: qué es interfaz y qué requiere API/SQL

| Paso | Interfaz | API / SQL |
|---|---|---|
| 0 SQL de base (4 archivos) | No | **SQL** (una vez por base) |
| 1 Tenant · 2 Módulos | Sí (panel SOPORTE) | Alternativa API |
| 3 Capacidad `membresias` | **No** | **API o SQL** |
| 4 IVA y precios | Sí (ADMIN) | Alternativa API |
| 5 Usuarios | Sí | — |
| 6 Categorías | **No** | **API** (`POST /pos/categories`) |
| 6 Productos | Sí (CSV o alta individual) | — |
| 7 Planes | Sí | — |
| 8 Alertas | Sí | Alternativa API |
| 9–10 Socios, cobro, check-in | Sí | — |
| 12 Reportes | Sí | — |

# Diseño: prueba pública de ESTIA (autoservicio)

Estado: diseño + **PP0 implementado** (ver §12). Nada está activo para el público y el SQL no se ha ejecutado. Fecha: 2026-10-18.

> **Aviso sobre el origen de este documento.** Pediste «continuar» el diseño de la prueba pública, pero en el repositorio y en las conversaciones guardadas **no existe ningún borrador previo**. Este documento lo diseña desde cero con una lectura concreta del término: *una persona interesada entra a una página pública, pide una prueba de su giro y recibe, en minutos y sin hablar con nadie, un negocio de demostración propio, aislado, con datos de ejemplo y con fecha de vencimiento.* Si tenías otra cosa en mente (p. ej. una demo compartida de solo lectura, o la prueba de una semana de PAC del CFDI), dímelo antes de construir: la sección 11 lista lo que cambiaría.

## 1. Objetivo y no-objetivos

**Objetivo:** que un prospecto de gimnasio, restaurante o retail pruebe el sistema real (POS, caja, membresías, reportes) en un negocio propio durante **30 días**, sin intervención de ESTIA, sin tocar datos de clientes reales y sin costo operativo descontrolado.

**No-objetivos (v1):** cobro en línea, conversión automática a plan de pago (se hace con ESTIA), timbrado real de CFDI, integraciones reales (bancos, mensajería), importación de datos del prospecto, SSO.

## 2. Qué existe hoy y se reutiliza (verificado en el código)

| Pieza | Dónde | Uso en la prueba |
|---|---|---|
| Alta de tenant completa (tenant + ADMIN + empresa + sucursal «Matriz» + suscripción + módulos por plan y giro) | `TenantsService.create` | Es la base: la prueba es un tenant normal, no un modo especial del código. |
| Suscripción con `endDate` y bloqueo al vencer («Suscripción vencida») | `SubscriptionsService`, `SubscriptionGuard` | El vencimiento de la prueba ya lo hace el sistema; solo se le pone fecha a 30 días. |
| Giros y módulos por giro | `giros.config`, `ModulesService.initFromPlan` | La prueba elige giro → trae los módulos correctos (membresías solo en gimnasio). |
| Carga de datos de ejemplo | Alta de «Gimnasio Demo» (entrega A) | Se convierte en una plantilla por giro (sección 5). |
| Límite de intentos | `@nestjs/throttler` (120/min por defecto, login más estricto) | Se endurece para los endpoints públicos nuevos. |
| Bitácora sin secretos | `AuditInterceptor` + `redactar` | Las solicitudes públicas no dejan correos ni claves en claro. |

**Hallazgo previo al diseño:** `POST /auth/register` es **público** y crea un usuario sin tenant ni rol. No es parte de esta prueba, pero la expone a abuso de la misma forma; debe cerrarse o ponerse detrás del mismo control antes de abrir una página pública (D-PP-9).

## 3. Recorrido del usuario

1. **Página pública** (`/prueba`, sin sesión): giro (gimnasio / restaurante / retail), nombre del negocio, nombre y correo. Aviso de privacidad y términos; casilla de aceptación.
2. **Verificación de correo:** se envía un enlace de un solo uso (válido 30 min). Sin correo verificado no se crea nada.
3. **Alta:** al abrir el enlace se crea el tenant de prueba, se siembran los datos del giro y se le pide al usuario **definir su propia contraseña** (no hay contraseñas por defecto ni se envían por correo).
4. **Recorrido guiado:** al entrar ve el tablero con 4 tareas del giro (p. ej. gimnasio: abrir turno → vender una bebida → cobrar una membresía → hacer check-in → ver el corte), con el mismo sistema real.
5. **Avisos:** banner permanente «Prueba — vence el DD/MM», correos al día 25, 28 y 30.
6. **Vencimiento:** a los 30 días el acceso se bloquea con el mensaje existente, adaptado: «Tu prueba terminó. Escríbenos para continuar». Se puede **extender una sola vez** por solicitud a ESTIA.
7. **Conversión:** ESTIA convierte el mismo tenant a plan de pago (cambia plan y fecha; los datos se conservan) o lo da de baja.

## 4. Arquitectura

### 4.1 Endpoints públicos nuevos (módulo `prueba-publica`)

| Endpoint | Qué hace | Controles |
|---|---|---|
| `POST /prueba/solicitar` | Valida datos, registra la solicitud y envía el enlace. Respuesta **idéntica** exista o no el correo (no se enumera a nadie). | Límite por IP y por correo; CAPTCHA; bloqueo de correos desechables; tope diario global. |
| `POST /prueba/activar` | Canjea el token (hash, un solo uso, 30 min), crea el tenant y deja la sesión iniciada. | Límite por IP y por token; el token nunca se guarda en claro. |
| `GET /prueba/estado` (con sesión) | Días restantes, tareas completadas. | Solo el propio tenant. |

La creación **reutiliza `TenantsService.create`** con plan de prueba y giro elegido; no se duplica lógica de alta.

### 4.2 Datos nuevos (tabla propia, sin tocar tablas existentes)

Mismo criterio que F0/F1 del CFDI: una tabla nueva, así desplegar el código no depende del SQL.

```sql
-- SOLO REFERENCIA — no ejecutar.
CREATE TABLE IF NOT EXISTS "pruebas_publicas" (
  "id"            uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenantId"      character varying,              -- null hasta activar
  "correoHash"    character varying(64) NOT NULL, -- sha256(correo normalizado + sal del servidor)
  "correoDominio" character varying(120) NOT NULL,
  "giro"          character varying(20) NOT NULL,
  "tokenHash"     character varying(64),          -- del enlace; se borra al canjear
  "tokenVenceEn"  TIMESTAMPTZ,
  "estado"        character varying(16) NOT NULL, -- SOLICITADA | ACTIVA | VENCIDA | CONVERTIDA | PURGADA
  "ip"            character varying(64),
  "venceEn"       TIMESTAMPTZ,
  "extendida"     boolean NOT NULL DEFAULT false,
  "createdAt"     TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "PK_pruebas_publicas" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pruebas_correo_activa" ON "pruebas_publicas" ("correoHash") WHERE "estado" IN ('SOLICITADA','ACTIVA');
```

El correo en claro vive **solo** en el usuario ADMIN del tenant (como cualquier alta); la tabla de pruebas guarda su hash para controlar duplicados sin exponer la lista.

### 4.3 Aislamiento (el requisito que no se negocia)

- **Un tenant por prueba**, nunca tablas ni datos compartidos entre pruebas. Todo el aislamiento por `tenantId` que ya tiene el sistema aplica sin cambios.
- Slug aleatorio no adivinable (`prueba-` + 8 caracteres); sin listado público de tenants (ya se limitó `resolve/:slug`).
- Specs obligatorios (como en el resto del backend): una prueba no ve productos/socios/ventas de otra ni de un cliente real; el token de una prueba no sirve en otro tenant; `SOPORTE` puede listar pruebas pero la API pública nunca.

## 5. Plantilla de datos por giro

Se arma desde la carga de «Gimnasio Demo» y equivalentes, **versionada y con spec** (el mismo seed produce siempre los mismos totales):

| Giro | Datos de ejemplo | Tareas guiadas |
|---|---|---|
| Gimnasio | 2 categorías, 3 productos de barra, 2 servicios, planes Mensual y Anual, 1 socio con NIP, IVA 16 % sin incluir | turno → venta de barra → cobrar membresía → check-in → corte |
| Restaurante | menú corto, mesas, cuentas abiertas (capacidad `mesas_cuenta_abierta`) | abrir mesa → dividir cuenta → cobrar → corte |
| Retail | 10 productos con IVA mixto (16 / 8 / 0 / exento) | turno → venta → devolución → corte |

Todas las cifras de ejemplo deben ser coherentes (p. ej. membresía de $500 → $580 con IVA), para que el recorrido pueda verificarse contra números conocidos.

## 6. Qué se limita en una prueba

| Función | En prueba | Por qué |
|---|---|---|
| CFDI | Solo el adaptador Mock y marcado «sin validez fiscal» (ya es así hasta F2) | No se timbra nada real. |
| Integraciones externas (bancos, mensajería) | Desactivadas | Costo y datos de terceros. |
| Usuarios | Hasta 5 | Evita reventa de una prueba como producto. |
| Almacenamiento / cargas | Tope por tenant | Costo. |
| Nómina / datos personales de empleados | Desactivado | PII sin necesidad. |
| Correos salientes del sistema | Solo los del ciclo de la prueba | Anti-spam. |

Se implementa como un **plan «PRUEBA»** (fila en `plans` + `plan_modules`), no con condicionales en el código: el sistema de módulos y planes ya existe para esto.

## 7. Abuso, costo y seguridad

1. **Verificación de correo obligatoria** antes de crear nada; token de un solo uso, 30 min, guardado como hash.
2. **Límites:** por IP (p. ej. 3 solicitudes/hora), por correo y por dominio, y **tope global** de pruebas activas y de altas por día (si se llega, la página muestra «lista de espera» en vez de crear). Los valores iniciales son decisión tuya (D-PP-3).
3. **CAPTCHA** en la solicitud; bloqueo de dominios de correo desechables.
4. **Una prueba activa por correo**; no se reinicia al vencer.
5. **Sin secretos en tránsito ni en bitácora:** la contraseña la define el usuario en el navegador; el correo solo lleva el enlace; la bitácora ya enmascara contraseñas y tokens.
6. **Respuestas uniformes** (no revelan si un correo ya tenía prueba) y mismo tiempo de respuesta aproximado.
7. **Aviso de privacidad (LFPDPPP)** y términos antes de pedir datos; el tenant de prueba se purga a los 30 días del vencimiento.
8. **Monitoreo:** altas/día, activaciones, vencidas, convertidas, rechazadas por límite; alerta si las altas se disparan.

## 8. Ciclo de vida y limpieza

| Día | Estado | Acción |
|---|---|---|
| 0 | ACTIVA | Tenant creado, `endDate` = hoy + 30 (`DIAS_PRUEBA`) |
| 25 / 28 / 30 | ACTIVA | Correos de aviso (reutiliza el servicio de alertas de suscripción) |
| 31 | VENCIDA | El `SubscriptionGuard` ya bloquea; el tenant se conserva |
| 61 | PURGADA | Tarea programada borra el tenant y todos sus datos en una transacción por tenant, con bitácora de lo purgado (sin PII) |
| cualquiera | CONVERTIDA | ESTIA cambia plan y fecha; sale del ciclo de purga |

La purga es el punto de mayor riesgo (borrar datos): se diseña **por tenant marcado como prueba y vencido**, con un seguro doble (estado `VENCIDA` en `pruebas_publicas` **y** plan `PRUEBA`) para que nunca pueda alcanzar un cliente real, y con un modo de ensayo que solo lista.

## 9. Pruebas requeridas (antes de abrir al público)

- Aislamiento entre dos pruebas y contra «Grupo Empresarial Demo» (specs + verificación real).
- Token: un solo uso, expira, no sirve dos veces ni en otro tenant.
- Límites: IP, correo, dominio y tope global.
- Respuesta idéntica para correo nuevo y repetido.
- Purga: solo toca tenants `PRUEBA` + `VENCIDA`; ensayo vs. real; no toca un tenant convertido.
- Carga de plantilla: totales conocidos por giro.
- Medición a 1366×768 de la página pública y del recorrido guiado, sin desborde.

## 10. Fases

| Fase | Contenido | Tamaño |
|---|---|---|
| PP0 | Plan `PRUEBA`, plantilla de datos del gimnasio, tabla `pruebas_publicas` (SQL sin ejecutar), cierre de `/auth/register` | S |
| PP1 | Endpoints solicitar/activar con verificación de correo, límites y CAPTCHA; correos del ciclo | M |
| PP2 | Página pública + recorrido guiado + banner de vencimiento | M |
| PP3 | Vencimiento, extensión, conversión y purga con ensayo | M |
| PP4 | Plantillas de restaurante y retail; métricas y alertas | S–M |

## 11. Decisiones que necesito de ti

| # | Decisión | Mi recomendación |
|---|---|---|
| D-PP-1 | ¿Es esto lo que querías por «prueba pública»? Alternativas: demo compartida de solo lectura (sin alta, más barata, menos convincente) o prueba asistida (alta manual por ESTIA). | Autoservicio por giro, empezando por **gimnasio** (ya tiene plantilla y verificación). |
| D-PP-2 | Duración: 30 días, una extensión. | **30 días** (antes 14; cambio del 2026-10-18), una extensión de 7 por solicitud a ESTIA. |
| D-PP-3 | Topes: pruebas activas simultáneas, altas por día, por IP. | 50 activas, 20 altas/día, 3/hora por IP; subir con evidencia. |
| D-PP-4 | Proveedor de correo y de CAPTCHA (hoy no hay uno integrado para altas públicas). | Un proveedor transaccional con dominio verificado; CAPTCHA sin cookies de terceros si es posible. |
| D-PP-5 | Retención tras vencer: 30 días y purga. | 30 días; extensible si hay conversación comercial abierta. |
| D-PP-6 | ¿Quién ve las pruebas y las convierte? | Solo SOPORTE, con pantalla de lista (nombre, giro, vence, tareas hechas). |
| D-PP-7 | Aviso de privacidad y términos: texto y responsable. | Lo redacta tu contador/abogado; sin eso no se publica. |
| D-PP-8 | ¿Se permite elegir giro «genérico» o solo los 3 con plantilla? | Solo los 3 con plantilla. |
| D-PP-9 | `POST /auth/register` público: cerrarlo o protegerlo. | Cerrarlo (no tiene consumidor conocido) antes de PP1. |

## 12. Estado de la implementación — PP0 (rama `feat/prueba-publica-pp0`)

Decisiones aprobadas: Turnstile, 30 días (antes 14), topes 50 activas / 20 altas al día / 3 por IP y hora, retención 30 días, solo SOPORTE convierte, solo giros con plantilla.

**Hecho (todo detrás de `PRUEBA_PUBLICA_ACTIVA`, apagado por defecto: sin la variable en `true` ambos endpoints responden 404 y no se crea, envía ni borra nada):**
- `prueba-publica-pp0-migration.sql` (+ migración TS): tabla `pruebas_publicas` y plan `PRUEBA` con 9 módulos y tope de 5 usuarios. **Sin ejecutar** (termina en ROLLBACK). Cambios respecto al borrador de §4.2: se añaden `correoCifrado` (el correo en claro hace falta hasta crear el ADMIN; va cifrado con `ENCRYPTION_KEY` y se borra al activar), `nombreNegocio`, `nombrePersona` y el estado `FALLIDA`.
- `POST /prueba/solicitar` (validaciones, Turnstile, topes, respuesta idéntica para un correo repetido, token de 32 bytes guardado solo como hash, 30 min) y `POST /prueba/activar` (un solo uso atómico, crea el tenant con `TenantsService.create`, siembra la plantilla del gimnasio y fija el vencimiento a `DIAS_PRUEBA` (30) días). Sin lecturas públicas.
- Plantilla del gimnasio (la misma de «Gimnasio Demo»), tope de 5 usuarios del plan PRUEBA, `marcarVencidas` y `purgar` con **ensayo por defecto** y doble seguro (fila VENCIDA + pasada la retención + el tenant sigue con plan PRUEBA).
- Puertos: `CaptchaVerifier` (adaptador Turnstile), `CorreoPrueba` y `TenantPurger`.

**Correo y aviso (segunda entrega de PP0):** puerto intercambiable `CorreoProvider` (`CORREO_PROVIDER`), adaptador `MockCorreoProvider` para pruebas y `ResendCorreoProvider` (escrito contra la documentación, probado solo con `fetch` simulado). Recomendación y comparativa: `docs/COMPARATIVA-CORREO.md`; DNS y variables: `docs/PRUEBA-PUBLICA-CONFIGURACION.md`. La solicitud exige la casilla del aviso (`aceptaAviso`) y guarda fecha del servidor, versión y URL del aviso (`avisoAceptadoEn`, `avisoVersion`, `avisoUrl`). Encendida pero con variables faltantes: 503 y el log dice solo qué nombres faltan; el `mock` no se permite fuera de test/development. Si el correo no sale, la solicitud queda FALLIDA y puede pedirse otra.

**Pendiente (no es PP0):** página pública y recorrido (PP2), **borrado físico del tenant** (PP3: hoy el purgador falla a propósito en lugar de fingir), tarea programada de vencimiento/purga, pantalla y conversión para SOPORTE, y que `/prueba/activar` inicie sesión. Para encenderla en el futuro hacen falta además `PRUEBA_PUBLICA_SAL`, `ENCRYPTION_KEY` y `TURNSTILE_SECRET`, y correr el SQL.

**NIP del socio de ejemplo y estado (tercera entrega de PP0/PP2):** la plantilla ya no usa un NIP fijo: `activar` genera un NIP de 4 dígitos **aleatorio por prueba** (sin los obvios: 0000, 1234, 4321, repetidos, pares repetidos), lo devuelve **una sola vez** en su respuesta junto con el n.º de socio, y en la base queda únicamente su HMAC (como cualquier NIP de socio); no se registra en logs ni en la bitácora. `GET /prueba/estado` (con sesión; el tenant sale solo del token; 404 si el negocio no es una prueba o está apagada) devuelve estado, fecha de vencimiento, días restantes, `vencida` y `extendida`, sin datos personales.

**Duración y tope (2026-10-18).** La duración vive en un solo lugar por repo: `DIAS_PRUEBA` en `src/prueba-publica/prueba-publica.config.ts` (vencimiento, correo de activación y avisos `DIAS_AVISO` = 25/28/30) y `DIAS_PRUEBA` en `src/pages/prueba/pruebaLogic.ts` del frontend (título, activación, guía). Cambiarla es tocar esas dos constantes y desplegar. El tope de 50 activas se revisó con 30 días: ver la respuesta del reporte (sigue siendo razonable para el arranque; se satura con ~1.7 altas/día sostenidas).

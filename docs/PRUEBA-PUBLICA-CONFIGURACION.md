# Prueba pública — qué configurar para encenderla (DNS y variables de Railway)

Hoy está **apagada** (`PRUEBA_PUBLICA_ACTIVA` no existe) y los endpoints `/prueba/*` responden 404. Esta es la lista exacta para encenderla **cuando decidas**. Orden sugerido: 1) SQL, 2) DNS, 3) cuentas, 4) variables, 5) encender.

## 0. SQL (una vez, con ROLLBACK primero)
`prueba-publica-pp0-migration.sql` (tabla `pruebas_publicas` y plan `PRUEBA`). Sin esto, activar una prueba falla de forma segura (la solicitud queda FALLIDA) y no se crea nada utilizable.

`prueba-publica-lista-espera-migration.sql` (tabla `pruebas_lista_espera`, sin ejecutar): guarda los correos de quien pide «Avísame» para un giro todavía sin plantilla (restaurante, tienda, otro). Solo la solicitud de aviso: correo cifrado + hash con sal, y fecha/versión/URL del aviso de privacidad aceptado. Sin esta tabla, `POST /prueba/avisame` responde 503 con un mensaje genérico y la prueba del gimnasio no se ve afectada.

## 1. Registros DNS (dominio `estiaconsultoria.com`)

**Estado actual que revisé** (consulta pública): la raíz tiene `TXT "v=spf1 include:_spf.mx.cloudflare.net ~all"` y MX a `route1/2/3.mx.cloudflare.net` (Cloudflare Email Routing). **No existe DMARC.** Por eso el envío va por un **subdominio** (`mail.`): así no se toca el SPF ni el correo entrante de la raíz (solo puede haber un SPF por nombre).

**Aviso:** los nombres y valores de los registros 1–3 de la tabla son los patrones habituales de Resend; la documentación que pude consultar sin cuenta **no los lista**, así que la fuente de verdad es el panel. Los registros se generan al agregar el dominio `mail.estiaconsultoria.com` en Resend (panel → Domains → Add domain, región a elegir). **Copia nombre y valor literalmente del panel**; los patrones son:

| # | Tipo | Nombre (host) | Valor | Para qué |
|---|---|---|---|---|
| 1 | TXT | `resend._domainkey.mail` | `p=…` (clave pública larga que te da el panel) | DKIM: firma de los correos |
| 2 | MX | `send.mail` | `feedback-smtp.<región>.amazonses.com` prioridad `10` (valor exacto en el panel) | Retorno de rebotes (Return-Path) |
| 3 | TXT | `send.mail` | `v=spf1 include:amazonses.com ~all` (valor exacto en el panel) | SPF del subdominio de retorno |
| 4 | TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:TU-CORREO@estiaconsultoria.com` | DMARC (recomendado; `p=none` solo observa, sin riesgo) |

Notas:
- Los nombres **2 y 3** pueden variar según lo que muestre el panel (Resend permite cambiar el subdominio de retorno, por defecto `send`). Manda lo que diga el panel, no esta tabla.
- **Cloudflare:** todos estos registros deben quedar **«Solo DNS» (nube gris)**, sin proxy: con la nube naranja la verificación no termina.
- Verifica con https://dns.email. Resend suele verificar en ~15 min (hasta 72 h por propagación).
- El registro 4 (`_dmarc` en la raíz) cubre también los subdominios. Empieza en `p=none`; endurecerlo (`quarantine`/`reject`) es una decisión posterior, con reportes en mano.
- **Turnstile no necesita DNS.** La URL de la página de activación (`app.estiaconsultoria.com`) ya existe.

## 2. Cuentas (las creas tú; yo no creé ninguna)
1. **Resend**: cuenta, dominio `mail.estiaconsultoria.com` verificado, **API key** con permiso «Sending access» limitada a ese dominio.
2. **Cloudflare Turnstile** (panel de Cloudflare → Turnstile → Add site): hostname `app.estiaconsultoria.com`; te da **Site key** (pública, va en la página de PP2) y **Secret key** (va a Railway).

## 3. Variables de Railway — servicio `tesoreria-saas-backend`

Estado hoy en producción (revisado sin imprimir valores): `ENCRYPTION_KEY` ya existe (64 caracteres); `NODE_ENV` viene **vacío** (por eso el adaptador `mock` solo se permite en `test`/`development`); **todas las demás NO están definidas.**

| Variable | Valor | Obligatoria | Notas |
|---|---|---|---|
| `PRUEBA_PUBLICA_ACTIVA` | `true` | sí, para encender | Cualquier otro valor o ausente = apagada (404). **Pónla al final.** |
| `PRUEBA_PUBLICA_SAL` | 32+ caracteres aleatorios (`openssl rand -hex 32`) | sí | Sal del hash de correos. **No la cambies después**: dejaría de detectar correos repetidos. |
| `ENCRYPTION_KEY` | (ya definida) | sí | Cifra el correo mientras se activa y el CSD. No la rotes sin el procedimiento (`ENCRYPTION_KEY_PREVIOUS`). |
| `TURNSTILE_SECRET` | Secret key de Turnstile | sí | |
| `PRUEBA_AVISO_URL` | URL `https://…` del aviso de privacidad | sí | La enlazas tú; va en el correo y se guarda con cada aceptación. |
| `PRUEBA_AVISO_VERSION` | p. ej. `2026-10-01` | sí | Cámbiala cuando cambie el texto del aviso: cada solicitud guarda la versión que aceptó. |
| `PRUEBA_PUBLICA_URL_BASE` | `https://app.estiaconsultoria.com/prueba/activar` | sí | Página de activación (PP2). El token va en el fragmento `#token=…`. |
| `CORREO_PROVIDER` | `resend` | sí | Con `mock` (o vacío) en Railway la prueba **se niega a operar** (503). |
| `RESEND_API_KEY` | API key `re_…` | sí | |
| `CORREO_REMITENTE` | `ESTIA <prueba@mail.estiaconsultoria.com>` | sí | Debe pertenecer al dominio verificado. |

Si falta cualquiera con la prueba encendida, los endpoints responden **503 «no disponible»** y en el log aparece **solo el nombre** de lo que falta (nunca valores).

## 4. Frontend (PP2, no incluido en PP0)
La **Site key** de Turnstile (pública) y la casilla del aviso con el enlace a `PRUEBA_AVISO_URL`. El servidor exige `aceptaAviso: true` y guarda la fecha (del servidor), la versión y la URL del aviso vigentes al aceptar.

## 5. Para encender (resumen)
SQL → DNS verificado → variables (todas menos `PRUEBA_PUBLICA_ACTIVA`) → redeploy → prueba de humo con tu correo → `PRUEBA_PUBLICA_ACTIVA=true`. Para apagarla en cualquier momento: quita o cambia esa variable.

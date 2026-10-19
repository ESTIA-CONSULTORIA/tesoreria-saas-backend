# Proveedor de correo transaccional: Resend vs. Amazon SES vs. Postmark

Fecha de consulta: **2026-10-18**, en los sitios de cada proveedor (enlaces al final). **No se creó ninguna cuenta.** Los precios y límites cambian: confírmalos en el sitio antes de contratar.
Caso de uso: correo de activación de la prueba pública (1 correo por solicitud; tope aprobado de 20 altas/día, es decir **menos de ~600 correos al mes**), más los correos de aviso de vencimiento (días 25, 28 y 30) que llegarán en PP3.

| Criterio | Resend | Amazon SES | Postmark |
|---|---|---|---|
| Plan gratis | **3,000 correos/mes**, tope **100/día**, 3 dominios | Créditos de hasta $200 por 6 meses (cuenta nueva); luego de pago | **100 correos/mes** (sin sobrecargo posible) |
| Siguiente nivel | Pro **$20/mes** = 50,000 (sobrecargo $0.90 por 1,000); sin tope diario | **$0.10 por 1,000** (à la carte); Essentials desde $0.16 por 1,000 | Basic **$15/mes** = 10,000 (sobrecargo $1.80 por 1,000) |
| Dominios de envío | 3 gratis; Pro/Scale más | Ilimitados (identidades) | 5 en Basic, 10 en Pro, ilimitados en Platform |
| API | REST JSON simple: `POST https://api.resend.com/emails`, `Authorization: Bearer`, **`Idempotency-Key`** (24 h), respuesta `{ "id" }` | AWS API (SES v2) con firma SigV4 o SMTP; sin cabecera de idempotencia equivalente en la API simple | REST JSON propio, token de servidor; flujos separados transaccional/difusión |
| Verificación de dominio | DKIM (TXT), SPF y retorno (`send.<subdominio>`: MX/TXT/CNAME según el panel); tarda ~15 min, hasta 72 h; recomienda DMARC | **Easy DKIM** (3 CNAME) + opcional *MAIL FROM* propio; **la cuenta nace en sandbox** | DKIM (TXT) + *Return-Path* (CNAME `pm-bounces` → `pm.mtasv.net`); SPF opcional |
| Restricciones de arranque | Ninguna: enviar desde un dominio verificado | **Sandbox**: solo a correos verificados, **200 mensajes/24 h, 1/s**; salir pide solicitud con respuesta **hasta 96 h** | Cuenta nueva sujeta a aprobación (revisión de uso); plan gratis muy corto |
| Reputación/entrega | Buena, enfocada a desarrolladores | Depende de ti (reputación de tu dominio e IP compartida); control total | La mejor fama en transaccional (infraestructura separada de difusión) |
| Esfuerzo de integración | Mínimo (1 `fetch`); adaptador ya escrito | Mayor (SigV4/SDK, IAM, SNS para rebotes) | Bajo |
| IP dedicada | $30/mes, solo en Scale y >3,000 correos/día | $24.95 por IP/mes | desde $50/mes, ≥300,000/mes, plan Pro+ |

## Recomendación: **Resend**

1. **Cabe gratis**: nuestro volumen de la prueba (<600/mes, <100/día) está dentro de 3,000/mes y 100/día. Si el tope diario estorbara, Pro cuesta $20/mes y no tiene tope diario.
2. **Mejor encaje con el diseño**: acepta **`Idempotency-Key`**, igual que exigimos a nuestro puerto (`claveIdempotencia`), y devuelve un `id` para soporte. La integración es un solo `POST` JSON; el adaptador `ResendCorreoProvider` ya está escrito y probado con un `fetch` simulado.
3. **Sin sandbox ni esperas**: se puede enviar en cuanto el dominio verifica (≈15 min). SES exige salir del sandbox (hasta 96 h) y Postmark revisa la cuenta y su plan gratis (100/mes) no alcanza ni para ensayar.
4. **Reversible**: el puerto `CorreoProvider` es intercambiable (`CORREO_PROVIDER`). Si la entregabilidad no fuera buena, **Postmark** es la alternativa natural (mejor fama transaccional, ~$15/mes); **SES** conviene solo a volúmenes grandes, por su costo por correo.

**Lo que no pude verificar** (las páginas consultadas no lo muestran sin cuenta): los valores exactos y nombres de los registros DNS de Resend (el panel los genera al agregar el dominio) y la política de revisión de cuentas nuevas de Postmark. Por eso `docs/PRUEBA-PUBLICA-CONFIGURACION.md` da los **patrones** y marca qué se copia literalmente del panel.

## Fuentes
- Resend: precios https://resend.com/pricing · dominios https://resend.com/docs/dashboard/domains/introduction y https://resend.com/docs/add-a-domain · enviar correo https://resend.com/docs/api-reference/emails/send-email
- Amazon SES: precios https://aws.amazon.com/ses/pricing/ · sandbox y producción https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html · Easy DKIM https://docs.aws.amazon.com/ses/latest/dg/send-email-authentication-dkim-easy.html
- Postmark: precios https://postmarkapp.com/pricing · Return-Path/DKIM https://postmarkapp.com/support/article/1197-my-return-path-record-wont-verify (y guías de terceros que coinciden)

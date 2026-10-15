# Comparativa de 4 PAC para CFDI 4.0 (con fuente por dato)

Consultado el **2026-10-15** en los sitios y documentación pública de cada proveedor. **No se contrató nada ni se creó ninguna cuenta.**
Complementa `DISENO-CFDI-40.md` (§9). Solo lectura y plan: nada implementado.

**Cómo leer la tabla**
- **✔ Verificado** = lo leí en la página citada ese día.
- **◐ Parcial** = la fuente lo menciona sin detalle suficiente para decidir.
- **✘ No verificado** = no apareció en lo que pude consultar; hay que preguntarlo al proveedor. No es lo mismo que "no lo tiene".
- Precios: son los publicados ese día; **cambian**; reconfirmar por escrito antes de presupuestar.

Un PAC extra que no se evaluó (Prodigia, Edicom, etc.) no está aquí por alcance, no por descarte.

---

## 1. Facturapi (facturapi.io)

| Dato | Resultado | Fuente |
|---|---|---|
| Estilo de API | ✔ "API Rest multi-RFC" | https://www.facturapi.io/ |
| Modo de pruebas | ✔ "Test Secret Key", "emitir CFDI de prueba"; prueba de 14 días sin costo | https://www.facturapi.io/ · https://www.facturapi.io/pricing |
| Llaves por ambiente | ✔ `sk_test_*` y `sk_live_*`; la test solo consulta la información de su organización | https://docs.facturapi.io/docs/guides/organizations/ |
| Multi-emisor (SaaS) | ✔ "Registra múltiples organizaciones bajo una misma cuenta y emite facturas usando distintos RFC"; sin cargo extra por RFC en el plan API | https://docs.facturapi.io/docs/intro/ · https://www.facturapi.io/pricing |
| Alta de emisor por API | ✔ `POST /v2/organizations` con la *User Key* | https://docs.facturapi.io/docs/guides/organizations/ |
| Carga de CSD | ◐ En dashboard: Configuración > Certificados (`.cer`, `.key`, contraseña). Por API se menciona `/v2/organizations/me/certificate` pero no el formato | https://docs.facturapi.io/docs/getting-started/organization-onboarding/ |
| Custodia del CSD | ✘ La página no dice si el proveedor lo almacena | misma |
| Tipos de CFDI | ✔ Ingreso, egreso, pago, nómina, traslado, retenciones y complementos | https://docs.facturapi.io/docs/intro/ |
| Cancelación | ✔ Motivos 01–04; `substitution` obligatorio con 01; estados `none/verifying/pending/accepted/rejected/expired`; consulta periódica al SAT; evento `invoice.cancellation_status_updated`; errores 409/400/404 | https://docs.facturapi.io/docs/guides/invoices/cancelaciones/ |
| Factura global | ✔ `createGlobalInvoice` agrupa e-receipts abiertos a "PUBLICO EN GENERAL"; automatizable por periodicidad; tope de 5,000 recibos; requiere tener contratada la función | https://docs.facturapi.io/docs/guides/receipts/ |
| Autofactura | ✔ El e-receipt envía un enlace a un portal de autofactura donde el cliente captura sus datos fiscales | https://docs.facturapi.io/docs/guides/receipts/ |
| Webhooks | ◐ Existe el evento de cancelación; la lista completa no la leí | guía de cancelaciones |
| Facturación asíncrona / intermitencias (202) | ◐ Aparece en el menú de guías; no leí su contenido | https://docs.facturapi.io/docs/intro/ |
| SDK | ✔ NodeJS, .NET, PHP, cURL; repositorio en GitHub (`facturapi`) | https://www.facturapi.io/ · docs (menú) |
| Precio API | ✔ $299 MXN/mes + $0.60 por timbre; autofactura y global $0.60; e-receipt $0.40; IVA incluido; consumo se factura el mes siguiente; sin timbres incluidos indicados; volumen por cotización | https://www.facturapi.io/pricing |
| Estado del servicio | ◐ Existe `status.facturapi.io`; no lo consulté | docs (pie) |
| SLA contractual | ✘ | — |

## 2. Facturama (facturama.mx)

| Dato | Resultado | Fuente |
|---|---|---|
| Sandbox | ✔ `https://apisandbox.facturama.mx`, "Pruebas sin validez fiscal"; registro gratis, "No requiere tarjeta ni suscripción" | https://facturama.mx/docs/es/bienvenidos |
| Producción | ✔ `https://api.facturama.mx` | misma |
| Autenticación | ✔ HTTP Basic Auth | misma |
| Estilo | ◐ Habla de "payload", "headers" y un playground; REST/JSON no se afirma literalmente | misma |
| Multi-emisor | ✔ "Factura a nombre de múltiples emisores con la API Multiemisor" | misma |
| SDK | ✔ PHP, Python, .NET, Node.js, Java, Ruby y JavaScript | misma |
| Qué incluye el módulo API | ✔ "Timbrado y sellado; consulta, cancelación y envío de facturas"; "API Web y API Multiemisor" | https://facturama.mx/planes-facturacion |
| Precio API | ✔ Módulo **$1,650 MXN, vigencia anual**; folios de API: **$0.50** (1–10,000), **$0.45** (10,001–50,000), **$0.40** (+50,000); precios con IVA; folios con vigencia anual, solo para este servicio, **prepago** | https://facturama.mx/planes-facturacion |
| Carga/custodia de CSD | ✘ | — |
| Cancelación con aceptación y estatus | ◐ Se menciona "cancelación"; sin detalle | docs/es/bienvenidos |
| Complemento de pago / factura global | ✘ No aparecen en las páginas consultadas (hay un índice `llms.txt` por revisar) | https://facturama.mintlify.site/llms.txt (no consultado) |
| Webhooks | ✘ | — |
| Nota | La página de docs contiene un bloque "Agent Instructions" dirigido a asistentes de IA; **no es documentación y se ignoró.** | — |

## 3. SW sapien (Smarter Web)

| Dato | Resultado | Fuente |
|---|---|---|
| Documentación | ✔ Centro de desarrolladores con referencia en Postman | https://developers.sw.com.mx/ |
| Pruebas | ✔ "Ambiente de pruebas": usuario de prueba y "CSD de Pruebas" vigentes; herramienta para validar CSD | https://developers.sw.com.mx/article-categories/get-started/ |
| URLs del ambiente, autenticación, límites | ✘ No están en la página; van en la referencia Postman | misma |
| Servicios | ✔ Timbrado (incluye "Emisión Timbrado JSON"), Timbrado V4 (IDs personalizados, correo, PDF), Retenciones, Cancelaciones (aceptación/rechazo y esquema nuevo), Consultas (saldo, CFDI relacionados, estatus SAT), Servicios complementarios (PDF, lista 69-B, validación) | https://developers.sw.com.mx/article-categories/servicios/ |
| Validadores | ✔ RFC + nombre + código postal contra SAT; Validar CFDI 4.0; Validar CSD | https://developers.sw.com.mx/ |
| Administrador de timbres | ✔ "ADT 2.0" (permite cancelar facturas, según el menú) | https://developers.sw.com.mx/ |
| Multi-emisor | ✘ No confirmado en las páginas leídas | — |
| Complemento de pago / factura global | ✘ No aparecen en el listado de servicios; los ejemplos de complementos podrían cubrirlos | https://developers.sw.com.mx/article-categories/ejemplos-4-0/ (no leído) |
| SDK | ◐ Organización de GitHub `lunasoft`; lenguajes no verificados | https://developers.sw.com.mx/article-categories/get-started/ |
| Webhooks | ✘ | — |
| Precio | ✘ **No publicado**: "Solicita una cotización" | https://developers.sw.com.mx/ |
| Disponibilidad | ◐ Página de estado `status.sw.com.mx` (no consultada) | https://developers.sw.com.mx/ |

## 4. Finkok (finkok.com)

| Dato | Resultado | Fuente |
|---|---|---|
| Integración | ✔ Web services: el sistema del cliente envía "solamente el XML" 4.0 y recibe el XML timbrado con acuse | https://finkok.com/ondemand.html |
| SOAP o REST | ✘ El sitio no lo declara (referencias de terceros hablan de SOAP; no verificado en fuente oficial) | — |
| Pruebas | ◐ "Kit de pruebas" con documentación y ejemplos de XML de timbrado y cancelación | https://finkok.com/ondemand.html · `kit-pruebas.html` |
| Modelo de cobro | ✔ "On demand": se paga lo consumido al cierre de 30 días; **mínimo de 500 facturas al mes, no acumulables**; primeros 30 días tras las pruebas sin cargo; se cancela sin penalización | https://finkok.com/ondemand.html |
| Timbres | ✔ "Timbres sin vigencia" | https://www.finkok.com/ |
| Precio | ✘ **No publicado**; el pie indica que no incluye impuestos | https://www.finkok.com/ |
| Cancelación | ✔ Servicio de cancelación y kit del "nuevo esquema" | https://www.finkok.com/ |
| Multi-emisor / socios | ✘ Existe "Ingreso Socios de Negocio" (portal), sin detalle del programa | https://www.finkok.com/ |
| Wiki técnica | ✘ **No pude abrir** `wiki.finkok.com` (error de certificado TLS desde mi entorno) | — |
| Complemento de pago / global | ✘ | — |
| Soporte | ✔ "Soporte 24/7" sin costo e integrador asignado sin costo (afirmaciones del proveedor) | https://www.finkok.com/ |

---

## 5. Lectura para nuestro caso (SaaS multi-negocio con CSD por empresa)

| Necesidad | Facturapi | Facturama | SW sapien | Finkok |
|---|---|---|---|---|
| Alta de emisores por API | ✔ | ✔ (Multiemisor) | ✘ | ✘ |
| Sandbox gratuito y documentado | ✔ | ✔ | ✔ (usuario + CSD de prueba) | ◐ (kit de pruebas) |
| Cancelación con estados y evento | ✔ | ◐ | ◐ | ◐ |
| Factura global y autofactura | ✔ (de fábrica) | ✘ | ✘ | ✘ |
| Precio publicado | ✔ | ✔ | ✘ | ✘ |
| Costo de arranque (publicado) | $299/mes + $0.60/timbre | $1,650/año + $0.40–0.50/folio (prepago anual) | cotización | mínimo 500 facturas/mes |

Qué **no** se puede concluir con esta evidencia: calidad real del timbrado, tiempos de respuesta, tasa de rechazos, soporte en la práctica, ni quién custodia el CSD. Eso solo sale de la **prueba de concepto en sandbox** (mismos 10 casos en 2 PAC) descrita en `DISENO-CFDI-40.md`.

## 6. Preguntas por escrito al proveedor antes de decidir

1. ¿Dónde y cómo se almacena el CSD (cifrado, región, retención) y se puede eliminar al terminar el servicio?
2. ¿Contrato de nivel de servicio, ventana de mantenimiento y qué ocurre con los timbres durante una caída?
3. ¿Se pueden revender o facturar timbres a mis clientes (modelo plataforma) y bajo qué términos?
4. ¿Existe llave por emisor/organización con permisos acotados, y límites de tasa por llave?
5. Complemento de pago, factura global y autofactura: ¿endpoint nativo o solo XML armado por nosotros?
6. ¿Webhooks firmados para cancelación y errores asíncronos?
7. Condiciones de salida: exportación de XML y datos de emisores, y qué pasa con los timbres no usados (vigencia).
8. Precio por volumen, mínimos mensuales y fecha de vigencia de la tarifa.

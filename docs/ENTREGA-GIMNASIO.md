# Entrega — Gimnasio Demo (ESTIA)

Fecha de alta: 2026-10-18 · Plan **BUSINESS** · Giro **gimnasio** · Zona horaria de vigencias: `APP_TIMEZONE` (por defecto America/Tijuana).

## Cómo entrar
- **URL:** https://app.estiaconsultoria.com — para una terminal dedicada: https://app.estiaconsultoria.com/login?tenant=gimnasio-demo
- Negocio (slug): `gimnasio-demo`. Una empresa («Gimnasio Demo») y una sucursal («Gimnasio Demo - Matriz», código GYM01).
- Las contraseñas y los NIP **no están en este archivo**: se entregaron por separado y deben cambiarse al estrenar el sistema.
- **Cómo entran RECEPCION y CAJERO:** con su NIP de 4 dígitos en el teclado de «Punto de Venta» (`/login?tenant=gimnasio-demo`), o en «Sistema Principal» con su correo y el NIP como contraseña.

## Usuarios y qué hace cada rol
| Rol | Entra con | Puede | No puede |
|---|---|---|---|
| ADMIN `admin@gimnasio-demo.estia` | correo y contraseña | Todo: usuarios, IVA, planes, productos, reportes | — |
| GERENTE `gerente@gimnasio-demo.estia` | correo y contraseña | Planes, reportes, cortesías, devoluciones, cancelar membresías | Configuración del sistema |
| RECEPCION `recepcion@gimnasio-demo.estia` | correo + NIP de 4 dígitos | Alta de socios, cobrar y renovar membresías, check-in, venta de barra, corte propio; descuento de beneficio hasta 10 % | Cortesías, crear planes, reportes de ingresos |
| CAJERO `cajero@gimnasio-demo.estia` | correo + NIP de 4 dígitos | Venta de barra y servicios, corte propio | Pantallas de membresías |

También hay **1 socio de prueba** (n.º 1, con NIP propio para check-in), 2 planes (**Mensual $500**, **Anual $5,000**, ambos con 10 % de descuento en barra) y el catálogo mínimo: categorías **Bebidas** (agua $20, isotónica $30, proteína $80) y **Servicios** (pase de día $100, hora de cancha $300).

## Configuración aplicada
Módulos activos: pos, configuracion_pos, usuarios, empresas, sucursales, reportes, costos, membresias. Capacidades: `membresias` y `venta_de_servicio`. IVA **16 % sin incluir** (un plan de $500 cobra **$580**). Inventario: `PERMITIR_NEGATIVO`.

## Límites conocidos
- **Sin CFDI integrado:** el sistema no timbra facturas. Los tickets no son comprobantes fiscales.
- **Sin reservas:** las canchas se siguen reservando en Playtomic; aquí solo se cobra la «Hora de cancha» como servicio.
- **Membresías cobradas en caja:** cada cobro es una venta del POS y entra al corte del turno; sin turno abierto no se puede cobrar.
- Las 5 ventas, 10 turnos (7 de ellos sin ventas, de pruebas de pantalla) y 2 check-ins del 17-18/10/2026 son de la **verificación de entrega** (todos los turnos cerrados; la membresía cobrada por CAJERO está devuelta). Antes de operar de verdad, el socio de prueba se puede dar de baja o dejarse como ejemplo.
- Cobrar o renovar una membresía solo lo permite el sistema a RECEPCION, GERENTE y ADMIN (un CAJERO recibe 403, también por API). Una devolución de membresía solo la hace GERENTE o ADMIN.

## Cómo reportar un problema
Escribe a soporte de ESTIA con: negocio (`gimnasio-demo`), usuario y rol, hora aproximada, pantalla, qué hiciste, qué esperabas y qué pasó (captura si puedes), y el folio de venta o n.º de socio si aplica. Si el sistema no deja cobrar, **no registres la venta por otro medio hasta avisar**: así el corte cuadra.

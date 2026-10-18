# Facturación electrónica (CFDI 4.0) — puntos para el contador

**Para:** contador del negocio · **De:** ESTIA · **Estado:** en preparación. Hoy el sistema **no timbra**: todo comprobante que genera es de prueba, **sin validez fiscal**, y «Facturación activa» está bloqueada hasta que usted confirme lo de abajo y exista proveedor autorizado (PAC). Marque su respuesta en la última columna; lo que no confirme no se activa.

## A. Reglas que el sistema aplica hoy y necesito que confirme  [VALIDAR]

| # | Tema | Lo que hace hoy el sistema (criterio propuesto) | ¿Correcto? / cambio |
|---|---|---|---|
| 1 | Nombre del emisor y receptor | Se captura **exacto como en la constancia de situación fiscal**, sin régimen societario («S.A. de C.V.»). | |
| 2 | Público en general | RFC `XAXX010101000`, nombre «PUBLICO EN GENERAL», régimen `616`, uso `S01`, CP del lugar de expedición. **No** se factura venta por venta a ese RFC: solo por factura global (aún no construida). | |
| 3 | Pago mixto (efectivo + tarjeta) | Un solo CFDI con la **forma de pago de mayor monto**, método `PUE`. Alternativa: `99` + `PPD` con complemento por forma. | |
| 4 | Propinas | **Fuera** del CFDI (se registran aparte). Hoy el sistema no las separa de la venta. | |
| 5 | Devolución de una venta facturada | Se emite **nota de crédito (egreso)**: relación `01`, uso `G02`, por las partidas devueltas. ¿O conviene **cancelar** según el mes y la aceptación del receptor? | |
| 6 | Redondeo | El IVA se calcula **por concepto** y el comprobante manda; si difiere del ticket hasta 5 centavos se avisa, y más de eso se bloquea. | |
| 7 | Descuento por partida | El concepto sale **neto** (precio efectivo). ¿Prefiere el descuento desglosado en el concepto? Un descuento **general** de la venta hoy bloquea la factura. | |
| 8 | Cancelación | Motivos 01–04; el 01 exige UUID sustituto; 01 y 04 quedan «pendiente de aceptación». ¿Umbrales de monto y plazos? | |
| 9 | Cortesías | Una venta con cortesía **no se factura**. | |
| 10 | Facturar después del cobro | Plazo para que un cliente pida su factura (días) y qué pasa si la venta ya entró en una **global**. | |
| 11 | Cuenta dividida «entre N» (restaurante) | ¿Un concepto proporcional por comensal o un concepto único de consumo? | |
| 12 | Conservación | XML y PDF mínimo **5 años**. ¿Es suficiente? | |
| 13 | IVA 8 % | El sistema permite 8 % por negocio. ¿Qué negocios califican (región fronteriza) y qué requisitos? | |
| 14 | IEPS | El sistema **no maneja IEPS** (bebidas saborizadas, alcohol, alimentos de alta densidad calórica). ¿Aplica a algún producto de la tabla B? | |
| 15 | Timbres | Si la plataforma paga los timbres y los cobra a cada negocio, ¿tiene implicaciones fiscales (reventa)? | |

## B. Claves SAT por giro — usted las entrega  (P-04)

El sistema deja la **clave de producto/servicio** (8 dígitos) **vacía** hasta que usted la confirme. La unidad la sugiere el sistema (servicio = `E48`, pieza = `H87`) y el objeto de impuesto es `02` (sí objeto) salvo que usted indique otro. Complete la columna «Clave».

| Giro | Partida de ejemplo | Unidad sugerida | IVA que cobra hoy | **Clave (8 dígitos)** | Objeto imp. / nota |
|---|---|---|---|---|---|
| Gimnasio | Membresía mensual / anual | E48 | 16 % | | |
| Gimnasio | Pase de día | E48 | 16 % | | |
| Gimnasio | Hora de cancha / clase | E48 | 16 % | | |
| Gimnasio | Agua embotellada | H87 | 16 % | | |
| Gimnasio | Bebida isotónica | H87 | 16 % | | ¿IEPS? (#14) |
| Gimnasio | Batido / proteína preparada | H87 | 16 % | | |
| Restaurante | Alimentos preparados (consumo en sitio) | E48 o H87 | 16 % | | |
| Restaurante | Bebidas sin alcohol / con alcohol | H87 | 16 % | | ¿IEPS? (#14) |
| Restaurante | Servicio a domicilio / cargo por servicio | E48 | 16 % | | |
| Retail | Mercancía general (por categoría) | H87 | 16 % (u 8 %) | | una clave por categoría |
| Médico / dental | Consulta y tratamientos | E48 | según su caso | | ¿exento? servicios médicos |

**Qué necesito de vuelta:** (1) la columna de la sección A, (2) las claves de la sección B, y (3) su respuesta a las decisiones D-04, D-05, D-06, D-09 y D-10 del diseño (`DISENO-CFDI-40.md`, §10).

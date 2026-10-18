# Diseño: CFDI 4.0 integrado al ERP

Estado: **solo diseño.** No se implementó nada ni se ejecutó SQL; el SQL de la sección 5 es de referencia.
Fecha: 2026-10-15. Alcance: emisión de CFDI 4.0 de ingreso, egreso (nota de crédito), complemento de pago 2.0 y factura global, desde caja, mesas, membresías y autofactura.

> **Aviso fiscal.** Las reglas del SAT cambian y varias aquí son criterios de diseño, no asesoría. Todo lo marcado **[VALIDAR]** debe confirmarlo el contador del negocio y el sandbox del PAC antes de construirse sobre ello.

## 0. Principio rector y arquitectura

**El usuario nunca sale del ERP para facturar, pagar o conciliar.** Los proveedores externos (PAC, banca, terminal de tarjeta, WhatsApp) viven detrás de **puertos** (interfaces) con adaptadores intercambiables y no aparecen en ninguna pantalla: ni su nombre, ni sus errores crudos, ni sus URLs.

```
Pantallas / casos de uso  ──►  Puerto (interfaz)  ──►  Adaptador (proveedor)
  facturar, cancelar            PacProvider             Mock | Facturapi | Facturama | SW | Finkok …
  conciliar                     BankProvider            (mismo patrón, fuera de este documento)
  cobrar con terminal           CardTerminalProvider
  avisar al cliente             MessagingProvider
```

Reglas comunes a todos los puertos:
1. **Un registro por tenant y capacidad** decide qué adaptador usa (`provider_binding`, ver §5); cambiar de PAC es cambiar una fila, no código de negocio.
2. **Errores traducidos**: el adaptador mapea el error del proveedor a un catálogo propio (`RFC_RECEPTOR_INVALIDO`, `CSD_VENCIDO`, `SERVICIO_NO_DISPONIBLE`…) con mensaje en español para el usuario. El error crudo solo va al log y a la bitácora técnica.
3. **Idempotencia y reintento seguro** en el puerto, no en cada pantalla.
4. **Adaptador `Mock`** siempre disponible: permite construir y probar todo el flujo sin PAC (§6).

## 1. Qué hay hoy y qué falta (verificado en el código)

| Entidad | Hoy | Falta para CFDI 4.0 |
|---|---|---|
| **Tenant** (`tenant.entity.ts`) | `legalName`, `tradeName`, `taxId`, `rfc` (texto libre, sin validar) | Ninguno fiscal obligatorio aquí: el emisor es la **empresa**, no el tenant. Quedan `rfc/taxId` duplicados → definir fuente única. |
| **Empresa** (`Company`) | `legalName`, `tradeName`, `taxId`, `baseCurrency` | **Emisor**: RFC validado, nombre fiscal **exacto como en la constancia** (sin régimen societario, p. ej. sin "S.A. de C.V.") **[VALIDAR]**, `regimenFiscal` (c_RegimenFiscal), serie(s) y folio, CSD (cer/key/contraseña), PAC. |
| **Sucursal** (`Branch`, con `companyId`) | Nombre y empresa | **Código postal de expedición** (`LugarExpedicion`). Una venta ya llega a su empresa por `sale.sucursalId → branch.companyId`. |
| **Cliente / receptor** | **No existe** (solo `Socio` de membresías: nombre, email, teléfono; `Supplier` tiene `rfc`) | Perfil fiscal del receptor: RFC, nombre fiscal, CP del domicilio fiscal, régimen fiscal del receptor, uso de CFDI por defecto, correo de envío. Reutilizable por socio, cuenta de mesa y autofactura. |
| **Producto** (`Product`) | `price`, `tasaIva` (16, 8, 0, EXENTO), `type`, `esServicio` | `claveProdServ` (c_ClaveProdServ, 8 dígitos), `claveUnidad` (c_ClaveUnidad, p. ej. H87 pieza, E48 servicio), `unidadNombre`, `objetoImp` (c_ObjetoImp: 01/02/03). `tasaIva` ya cubre la tasa del traslado de IVA. |
| **Venta** (`Sale`) | `items` (JSON con `tasaIva`, `ivaIncluido`), `subtotal`, `descuento`, `impuestos`, `total`, `formaPago`, `formasPago[]` (con `itemIndexes`, `dividido`), `status`, `folio`, `sucursalId` | Vínculo a CFDI(s) (**tabla de enlace**, no columnas: una venta puede dar varios CFDI y un CFDI global cubre muchas ventas), `propina` (hoy **no existe**: "propina sugerida" es solo un parámetro de pantalla sin guardar), código corto de autofactura, marca `facturable`. |
| **Integraciones** | `integrations.service.ts` ya cifra credenciales con `ENCRYPTION_KEY` (AES-256-CBC); catálogo con un `sat-cfdi` de relleno | El mecanismo de cifrado se reutiliza, **pero** CSD merece un formato autenticado (GCM) y custodia propia (§2.3). |
| **Catálogos SAT** | No existen | `c_ClaveProdServ` (~50 mil filas), `c_ClaveUnidad`, `c_FormaPago`, `c_UsoCFDI`, `c_RegimenFiscal`, `c_ObjetoImp`, `c_Impuesto`, `c_Moneda`, `c_TipoRelacion`, `c_MotivoCancelacion`, `c_Periodicidad`, `c_Meses`, `c_CodigoPostal`. Tabla propia con búsqueda. |

### 1.1 Datos fiscales nuevos (resumen por entidad)

- **Empresa (emisor):** `rfc`, `nombreFiscal`, `regimenFiscal`, `serie`, `folioActual`, `csdId`, `pacBindingId`, `facturacionActiva`.
- **Sucursal:** `codigoPostalExpedicion`.
- **Perfil fiscal del receptor** (`receptor_fiscal`): `rfc`, `nombreFiscal`, `codigoPostal`, `regimenFiscal`, `usoCfdiDefault`, `email`, `esExtranjero`.
- **Producto:** `claveProdServ`, `claveUnidad`, `unidadNombre`, `objetoImp`; (opcional) `iepsTasa` si el giro lo requiere (fuera de alcance, ver riesgos).
- **Venta:** `receptorFiscalId` (nullable), `codigoFactura` (texto corto aleatorio, para el ticket/QR), `propina` (decimal, **fuera** del subtotal fiscal salvo decisión D-04).
- **Públicos en general:** RFC genérico nacional `XAXX010101000`, nombre `PUBLICO EN GENERAL`, régimen `616`, uso `S01`, CP = el del lugar de expedición **[VALIDAR]**; extranjero `XEXX010101000`.

## 2. `PacProvider` (puerto) y custodia de credenciales

### 2.1 Interfaz

```ts
export interface PacProvider {
  readonly capacidades: { cancelacionConAceptacion: boolean; consultaEstatusSat: boolean; complementoPago: boolean; globalPublico: boolean };

  /** Valida contra el proveedor sin timbrar (RFC, nombre, CP, régimen del receptor; estructura). */
  validar(entrada: CfdiEntrada): Promise<ResultadoValidacion>;

  /** Timbra. `claveIdempotencia` es obligatoria: el mismo valor nunca produce dos timbrados. */
  timbrar(entrada: CfdiEntrada, claveIdempotencia: string): Promise<CfdiTimbrado>;

  /** Recupera un CFDI ya timbrado por referencia, para reintentos tras timeout (nunca re-timbrar a ciegas). */
  consultarPorReferencia(emisorRfc: string, referencia: string): Promise<CfdiTimbrado | null>;

  cancelar(uuid: string, motivo: '01' | '02' | '03' | '04', uuidSustituto?: string): Promise<ResultadoCancelacion>;
  estatus(uuid: string): Promise<EstatusSat>;               // Vigente | Cancelado | EnProceso | NoEncontrado
  descargarXml(uuid: string): Promise<Buffer>;
  descargarPdf?(uuid: string): Promise<Buffer>;             // opcional: si no, se genera en el ERP

  /** Alta/estado del emisor y su CSD en el proveedor (si el modelo del proveedor lo exige). */
  registrarEmisor?(emisor: EmisorEntrada, csd: CsdDescifrado): Promise<void>;
  saldoTimbres?(emisorRfc: string): Promise<number>;
}
```

`CfdiEntrada` es **modelo propio** (emisor, receptor, conceptos con impuestos, forma/método de pago, relaciones, información global, complementos), independiente del formato de cada PAC. El adaptador lo traduce. La construcción del XML y la cadena original pueden vivir en el ERP (modo "timbrado de XML ya sellado") o delegarse al PAC (modo "JSON → CFDI"); el puerto soporta ambos y se decide por adaptador.

### 2.2 Adaptadores previstos

`MockPacProvider` (pruebas y demos, §6), y uno por proveedor real elegido (§8). Solo el adaptador conoce URLs, autenticación y formatos.

### 2.3 Credenciales y CSD cifrados con `ENCRYPTION_KEY`

El CSD (archivo `.cer`, `.key` y su contraseña) **firma facturas a nombre del contribuyente**: es el secreto más sensible del sistema.

| Elemento | Dónde vive | Cómo |
|---|---|---|
| Credenciales del PAC (usuario/token) | `provider_credential.secreto_cifrado` | Cifradas con `ENCRYPTION_KEY` |
| `.key` del CSD y contraseña | `fiscal_csd.key_cifrado`, `fiscal_csd.password_cifrado` | Cifrados con `ENCRYPTION_KEY` |
| `.cer` (público) | `fiscal_csd.cer_pem` | Sin cifrar (es público), junto con número de certificado y vigencia |

Reglas:
1. **Formato autenticado.** Hoy `encrypt()` usa AES-256-CBC sin autenticación. Para el CSD se define un formato versionado `v2:gcm:<keyId>:<iv>:<tag>:<texto>` (AES-256-GCM, IV de 12 bytes aleatorio por valor). `decrypt` sigue entendiendo el formato actual (migración sin ruptura). `keyId` permite rotar `ENCRYPTION_KEY` sin re-cifrar todo de golpe.
2. **Nunca de vuelta al navegador.** Ningún endpoint devuelve `.key`, contraseña ni credenciales; solo "cargado", número de certificado, RFC del certificado y fecha de vencimiento.
3. **Descifrado solo en el momento de firmar/llamar**, en memoria, sin escribir a disco ni a logs.
4. **Validación al cargar**: el `.cer` debe ser un CSD (no FIEL), el RFC del certificado debe ser el de la empresa, la contraseña debe abrir el `.key` y el par debe corresponder; vigencia futura.
5. **Solo ADMIN del tenant** (y SOPORTE con auditoría) carga o reemplaza; toda operación a `audit_log` con quién y desde dónde.
6. **Entornos separados**: credenciales sandbox y producción son filas distintas; un tenant en sandbox nunca timbra real.
7. Si `ENCRYPTION_KEY` falta o es corta, **no se puede guardar ni usar** un CSD (error claro, el backend no cae). Cambiarla sin re-cifrar deja los CSD ilegibles: el procedimiento de rotación forma parte de la fase 0.
8. **Alternativa a evaluar (D-02):** delegar la custodia del CSD al PAC (varios lo ofrecen) y que el ERP solo guarde una referencia. Reduce el riesgo en el ERP y lo concentra en el proveedor.

## 3. Flujos

### 3.1 Máquina de estados de un CFDI (`invoice.status`)

```
BORRADOR ──validar──► LISTO ──timbrar──► PENDIENTE ──ok──► TIMBRADO ──cancelar──► CANCELACION_PENDIENTE ──► CANCELADO
                         │                  │                                         │
                         └──rechazo────► ERROR_VALIDACION     └──timeout──► INCIERTO ──consulta──► TIMBRADO | ERROR
```

`INCIERTO` es clave: si el timbrado expira sin respuesta, **no se vuelve a timbrar**; se consulta por referencia y solo si el PAC no lo tiene se reintenta con la misma `claveIdempotencia`.

### 3.2 Desde caja (venta → factura)

1. **Venta** cobrada (`PAGADA`). Nada fiscal ocurre por defecto.
2. **Solicitud**: al cobrar o después (hasta el plazo, D-07) el cajero captura/elige el perfil fiscal del receptor (búsqueda por RFC; datos validados contra la lista de contribuyentes del PAC) y el **uso de CFDI**. Sin perfil → se factura a público en general **solo vía global** (§3.6).
3. **Armado**: del `Sale` se genera `CfdiEntrada`: un concepto por línea (`claveProdServ`, `claveUnidad`, `objetoImp` del producto), descuento por línea, traslados de IVA por tasa, `FormaPago` según §4.3, `MetodoPago` PUE si ya se cobró, `Moneda` MXN, `Exportacion` 01, `LugarExpedicion` de la sucursal.
4. **Validar** (local + `PacProvider.validar`) → mostrar al cajero errores accionables ("el CP del receptor no coincide con su RFC").
5. **Timbrar** → guardar XML, UUID, sello, fecha, cadena y QR; generar PDF; **enviar** por correo/WhatsApp (puerto `MessagingProvider`).
6. El ticket impreso lleva `codigoFactura` y QR a la autofactura (§3.3).

### 3.3 Autofactura (el cliente factura solo, sin entrar al ERP)

Pantalla pública del negocio (marca del tenant, sin mencionar proveedores):

1. El cliente captura el **código del ticket** (`codigoFactura`) + total, o escanea el QR.
2. Captura/valida su perfil fiscal (RFC → el sistema consulta nombre, régimen y CP y los precarga).
3. Elige uso de CFDI; revisa el resumen; confirma.
4. Se genera la solicitud (`invoice_request`) y se timbra con el mismo flujo; recibe XML/PDF por correo y en pantalla.

Seguridad de la ruta pública: código de al menos 10 caracteres aleatorios (no el folio consecutivo), un solo uso, caducidad por política (D-07), **límite de intentos por IP y por código**, respuesta uniforme ante código inexistente (sin enumerar), sin devolver partidas de venta ajenas, CAPTCHA tras fallos.

### 3.4 Cancelación

Motivos del SAT: **01** comprobante emitido con errores *con* relación (requiere UUID sustituto), **02** con errores *sin* relación, **03** no se llevó a cabo la operación, **04** operación nominativa relacionada en una factura global.
- La cancelación puede requerir **aceptación del receptor** según monto y motivo **[VALIDAR umbrales y plazos]**; el estado `CANCELACION_PENDIENTE` y la consulta periódica de estatus lo reflejan.
- Permiso propio (`facturacion:cancelar`), motivo obligatorio y bitácora.
- Cancelar un CFDI **no** devuelve dinero ni cancela la venta; son operaciones independientes y se enlazan en pantalla.

### 3.5 Devolución → nota de crédito (egreso)

Hoy `returnSale()` devuelve la venta completa. Con CFDI:
- Si la venta tenía CFDI vigente, la devolución genera un **CFDI de egreso** (`TipoDeComprobante=E`, `TipoRelacion=01`, `CfdiRelacionados=UUID` original) por los importes devueltos, o —si procede y el receptor acepta— una **cancelación** **[VALIDAR cuál conviene según el mes y el receptor, D-06]**.
- Si la venta estaba en una global, la devolución se acumula en la global del periodo o genera egreso a público en general.
- La devolución **no se completa** como "fiscalmente cerrada" hasta tener el egreso o la cancelación; mientras, queda `facturacion_pendiente` visible.

### 3.6 Complemento de pago 2.0 (REP)

Aplica cuando el CFDI de ingreso se emitió con **PPD** (pago diferido/parcial) y el cliente paga después: cuentas por cobrar, membresías con pago posterior, anticipos.
- Por cada pago recibido se emite un CFDI `TipoDeComprobante=P` con `DoctoRelacionado` (UUID, parcialidad, saldo anterior, importe pagado, saldo insoluto, objeto de impuesto).
- Una venta de mostrador cobrada completa **no** requiere REP (PUE).
- Se dispara desde el registro de pago (`Movement` / conciliación): al conciliar un depósito contra una factura PPD se ofrece generar el REP en el mismo paso, sin salir del ERP.

### 3.7 Facturación global (público en general)

- Reúne las ventas **no facturadas individualmente** de un periodo (día/semana/quincena/mes/bimestre) por empresa y, normalmente, por sucursal/CP de expedición.
- Lleva `InformacionGlobal` (periodicidad, mes, año) y receptor genérico `XAXX010101000`.
- **Generación**: tarea programada y revisable. Antes de emitir, muestra el resumen (ventas incluidas, excluidas, total por tasa) y exige aprobación (D-08).
- **Exclusiones**: ventas ya facturadas, canceladas, cortesías, devueltas íntegras y, según criterio, ventas con CFDI pendiente.
- Cada venta queda ligada a su global (`invoice_sale`); una **autofactura posterior** a una venta ya incluida en una global requiere cancelar/sustituir esa parte **[VALIDAR; D-07 fija el plazo para evitarlo]**.

## 4. Aplicación a los casos del negocio

### 4.1 Membresías
- El plan es un producto (`claveProdServ`/`claveUnidad` de servicio recurrente configurables); cada cobro es una venta y puede facturarse al perfil fiscal **del socio** (se liga el `receptor_fiscal` al `Socio`).
- Renovaciones automáticas: facturar al cobrar (PUE) o programar la global; el comprobante lleva el periodo cubierto en una nota/concepto.
- Cobro diferido/pendiente → **PPD + REP** (§3.6).

### 4.2 Mesas con división de cuenta
Hoy el cobro parcial registra `formasPago[]` con `itemIndexes` o con un monto "entre N".
- **Por ítems**: cada grupo de ítems puede facturarse a un receptor distinto; el CFDI toma esas líneas completas y reparte descuento e impuestos como ya lo hace el servidor (`pesoDeItem`).
- **Por monto "entre N"**: no hay líneas propias; el CFDI de cada comensal lleva un concepto por proporción (cantidad fraccionaria) o un concepto único de consumo **[VALIDAR el criterio con el contador, D-09]**.
- **Regla de cuadre**: la suma de los CFDI emitidos de una cuenta nunca puede exceder su total; el sistema muestra "facturado X de Y".
- Una cuenta abierta **no** se factura: solo al estar `PAGADA` o por cada pago parcial ya cobrado.

### 4.3 Pagos mixtos
Un CFDI admite **una** `FormaPago`. Opciones **[VALIDAR, D-05]**:
- **A.** La de mayor monto (efectivo, `01`; transferencia, `03`; tarjeta crédito `04`; débito `28`) con PUE.
- **B.** `99` "Por definir" con **PPD** y un REP por cada forma real (más exacto, más CFDI).
Los 4 últimos dígitos de tarjeta que ya se exigen se conservan en la venta para conciliar, no van en el CFDI.

### 4.4 Propinas
Hoy **no existen** en el modelo. Criterio propuesto **[VALIDAR, D-04]**: la propina voluntaria entregada al personal **no** forma parte del importe facturado (se registra aparte en la venta y en el corte); si el negocio decide incluirla en la cuenta, se factura como concepto sin impuestos. Hasta decidirlo, el campo se agrega a la venta pero no entra al CFDI.

### 4.5 Otros
- **Descuentos**: por línea en el concepto (`Descuento`); no hay descuento global en CFDI.
- **Cortesías**: sin cobro, no se facturan; la global las excluye.
- **Ventas offline**: se facturan **después** de sincronizar (necesitan folio y total del servidor).
- **Precios con IVA incluido**: el CFDI siempre desglosa; la base se calcula igual que hoy (`calcularTotalesIva`).

## 5. Tablas nuevas (SQL de referencia — **no ejecutar**)

```sql
-- 1) Emisor: extiende la empresa (la empresa ya existe).
ALTER TABLE company
  ADD COLUMN IF NOT EXISTS "rfc" varchar(13),
  ADD COLUMN IF NOT EXISTS "nombreFiscal" varchar(254),
  ADD COLUMN IF NOT EXISTS "regimenFiscal" varchar(3),
  ADD COLUMN IF NOT EXISTS "facturacionActiva" boolean NOT NULL DEFAULT false;
ALTER TABLE branch ADD COLUMN IF NOT EXISTS "codigoPostalExpedicion" varchar(5);

-- 2) Producto y venta.
ALTER TABLE product
  ADD COLUMN IF NOT EXISTS "claveProdServ" varchar(8),
  ADD COLUMN IF NOT EXISTS "claveUnidad"   varchar(3),
  ADD COLUMN IF NOT EXISTS "unidadNombre"  varchar(40),
  ADD COLUMN IF NOT EXISTS "objetoImp"     varchar(2);
ALTER TABLE sale
  ADD COLUMN IF NOT EXISTS "receptorFiscalId" uuid,
  ADD COLUMN IF NOT EXISTS "codigoFactura"    varchar(16),
  ADD COLUMN IF NOT EXISTS "propina"          numeric(10,2) NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_sale_codigo_factura" ON sale ("codigoFactura") WHERE "codigoFactura" IS NOT NULL;

-- 3) Receptor fiscal (clientes, socios, autofactura).
CREATE TABLE IF NOT EXISTS receptor_fiscal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" uuid NOT NULL,
  rfc varchar(13) NOT NULL,
  "nombreFiscal" varchar(254) NOT NULL,
  "codigoPostal" varchar(5) NOT NULL,
  "regimenFiscal" varchar(3) NOT NULL,
  "usoCfdiDefault" varchar(4),
  email varchar(254),
  "esExtranjero" boolean NOT NULL DEFAULT false,
  "validadoEn" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenantId", rfc, "codigoPostal")
);
ALTER TABLE socio ADD COLUMN IF NOT EXISTS "receptorFiscalId" uuid;

-- 4) CSD y credenciales (cifrados con ENCRYPTION_KEY).
CREATE TABLE IF NOT EXISTS fiscal_csd (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" uuid NOT NULL,
  "companyId" uuid NOT NULL,
  "numeroCertificado" varchar(20) NOT NULL,
  rfc varchar(13) NOT NULL,
  "vigenteDesde" timestamptz NOT NULL,
  "vigenteHasta" timestamptz NOT NULL,
  "cerPem" text NOT NULL,
  "keyCifrado" text NOT NULL,
  "passwordCifrado" text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  "cargadoPor" varchar(120),
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_fiscal_csd_activo" ON fiscal_csd ("companyId") WHERE activo;

CREATE TABLE IF NOT EXISTS provider_binding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" uuid NOT NULL,
  "companyId" uuid,
  capacidad varchar(30) NOT NULL,            -- 'PAC' | 'BANCO' | 'TERMINAL' | 'MENSAJERIA'
  adaptador varchar(40) NOT NULL,            -- 'mock' | 'facturapi' | ...
  ambiente varchar(12) NOT NULL DEFAULT 'SANDBOX',  -- 'SANDBOX' | 'PRODUCCION'
  "secretoCifrado" text,
  activo boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenantId", "companyId", capacidad, ambiente)
);

-- 5) Series y folios (atómico por empresa).
CREATE TABLE IF NOT EXISTS invoice_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" uuid NOT NULL, "companyId" uuid NOT NULL,
  tipo varchar(1) NOT NULL,                  -- I, E, P
  serie varchar(25) NOT NULL,
  "folioActual" integer NOT NULL DEFAULT 0,
  UNIQUE ("companyId", tipo, serie)
);

-- 6) El comprobante.
CREATE TABLE IF NOT EXISTS invoice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" uuid NOT NULL,
  "companyId" uuid NOT NULL,
  tipo varchar(1) NOT NULL,                  -- I, E, P
  estado varchar(24) NOT NULL,               -- BORRADOR, LISTO, PENDIENTE, TIMBRADO, ERROR_VALIDACION, INCIERTO, CANCELACION_PENDIENTE, CANCELADO
  serie varchar(25), folio integer,
  uuid varchar(36),
  "receptorFiscalId" uuid,
  "esGlobal" boolean NOT NULL DEFAULT false,
  "informacionGlobal" jsonb,                 -- periodicidad, meses, año
  "usoCfdi" varchar(4), "formaPago" varchar(2), "metodoPago" varchar(3),
  subtotal numeric(14,2) NOT NULL, descuento numeric(14,2) NOT NULL DEFAULT 0,
  impuestos numeric(14,2) NOT NULL DEFAULT 0, total numeric(14,2) NOT NULL,
  conceptos jsonb NOT NULL,                  -- snapshot de lo timbrado
  "xmlRef" text, "pdfRef" text,              -- ruta en el almacenamiento, no el XML en la fila
  "claveIdempotencia" varchar(80) NOT NULL,
  "relacionadoUuid" varchar(36), "tipoRelacion" varchar(2),
  "fechaTimbrado" timestamptz,
  "errorCodigo" varchar(60), "errorMensaje" text,
  "creadoPor" varchar(120),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenantId", "claveIdempotencia")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_invoice_uuid" ON invoice (uuid) WHERE uuid IS NOT NULL;

-- 7) Qué ventas ampara cada CFDI (global y parciales por ítems).
CREATE TABLE IF NOT EXISTS invoice_sale (
  "invoiceId" uuid NOT NULL REFERENCES invoice(id),
  "saleId" uuid NOT NULL,
  "tenantId" uuid NOT NULL,
  "itemIndexes" integer[],                   -- null = venta completa
  importe numeric(14,2) NOT NULL,
  PRIMARY KEY ("invoiceId", "saleId")
);
CREATE INDEX IF NOT EXISTS "IDX_invoice_sale_sale" ON invoice_sale ("saleId");

-- 8) Cancelaciones, autofactura y bitácora.
CREATE TABLE IF NOT EXISTS invoice_cancellation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "invoiceId" uuid NOT NULL REFERENCES invoice(id), "tenantId" uuid NOT NULL,
  motivo varchar(2) NOT NULL, "uuidSustituto" varchar(36),
  estado varchar(24) NOT NULL,               -- SOLICITADA, ACEPTADA, RECHAZADA, PLAZO_VENCIDO
  "solicitadaPor" varchar(120), "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS invoice_request (   -- autofactura pública
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" uuid NOT NULL, "saleId" uuid NOT NULL,
  estado varchar(20) NOT NULL, "invoiceId" uuid, ip varchar(64),
  intentos integer NOT NULL DEFAULT 0, "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS invoice_event (
  id bigserial PRIMARY KEY, "invoiceId" uuid NOT NULL, "tenantId" uuid NOT NULL,
  evento varchar(40) NOT NULL, detalle jsonb, "createdAt" timestamptz NOT NULL DEFAULT now()
);

-- 9) Catálogos del SAT (cargados desde los archivos oficiales).
CREATE TABLE IF NOT EXISTS sat_catalogo (
  catalogo varchar(30) NOT NULL, clave varchar(10) NOT NULL, descripcion text NOT NULL,
  "vigenteDesde" date, "vigenteHasta" date, PRIMARY KEY (catalogo, clave)
);
CREATE INDEX IF NOT EXISTS "IDX_sat_catalogo_desc" ON sat_catalogo USING gin (to_tsvector('spanish', descripcion));
```

Notas: los nombres de tabla/columna siguen la convención camelCase entrecomillada que usa el esquema actual. El **XML no se guarda en la fila** sino en el almacenamiento (`src/storage`), con su hash en `invoice`. Retención del XML: 5 años mínimo **[VALIDAR]**.

## 6. Qué se construye y prueba SIN PAC, y qué necesita sandbox

| Se puede construir y probar sin PAC (con `MockPacProvider`) | Requiere sandbox del PAC |
|---|---|
| Datos fiscales de empresa, sucursal, producto, receptor; catálogos SAT | Timbrado real (UUID, sello del SAT, timbre fiscal) |
| Validación local de RFC (formato y dígito verificador), CP, claves de catálogo | Validación del receptor contra la lista del SAT (RFC + nombre + CP + régimen) |
| Armado de `CfdiEntrada` y XML 4.0; validación contra los XSD del SAT; cadena original | Sellado/aceptación con CSD real o de pruebas |
| Cálculo de impuestos por concepto y total; redondeo; descuento; IVA 16/8/0/exento | Reglas de redondeo que el PAC/SAT rechazan en la práctica |
| Mapeo de formas de pago, pagos mixtos, propina, división de cuenta, membresías | Cancelación con aceptación y estatus real |
| Máquina de estados, idempotencia, `INCIERTO` y reintento, bitácora | Tiempos de respuesta, timeouts y límites de tasa reales |
| Cifrado/descifrado de CSD y credenciales, rotación de llave, auditoría | Formato real de errores del proveedor |
| Autofactura end-to-end (seguridad, límites, caducidad) contra el Mock | Envío del PDF/XML por el proveedor, si se usa |
| Facturación global (selección, exclusiones, totales) | Complemento de pago aceptado por el SAT |
| Specs de aislamiento por tenant y de permisos | Pruebas con CSD de prueba que publica el SAT |

Un **`MockPacProvider` determinista** (UUID falsos reproducibles, errores configurables, latencia simulada) cubre más de la mitad del trabajo y deja el cambio a un PAC real en un adaptador.

## 7. Riesgos

### 7.1 Fiscales
1. **Datos del receptor incorrectos** (nombre, CP, régimen) → el SAT rechaza o el cliente no puede deducir. Validar siempre contra el PAC y no timbrar con datos "aproximados".
2. **Redondeo.** Hoy el IVA se redondea **una vez por grupo de tasa** en la venta; el CFDI calcula el traslado **por concepto**. Pueden diferir centavos entre el ticket y el CFDI. Decisión D-10: o el CFDI manda (y el ticket muestra su total), o se recalcula la venta por concepto. Se resuelve con el sandbox, no con teoría.
3. **Clave de producto/unidad mal asignada** → deducción cuestionable. Sugerir por giro, exigir confirmación y permitir carga masiva.
4. **Doble facturación** (individual + global, o dos autofacturas) → la tabla `invoice_sale` y un candado por venta lo impiden; sin ese candado es el riesgo n.º 1 del producto.
5. **Cancelación fuera de plazo o sin aceptación** → el CFDI sigue vigente aunque el ERP lo muestre cancelado; el estado debe salir del SAT, no del ERP.
6. **Pagos mixtos, propinas y división** sin criterio fiscal documentado (D-04, D-05, D-09).
7. **IEPS, retenciones, impuestos locales, moneda extranjera**: fuera de alcance; si el giro los tiene (bebidas, alcohol), la fase se detiene hasta definirlos.
8. **Cambios del Anexo 20/catálogos**: los catálogos y XSD deben versionarse y actualizarse sin redeploy de código de negocio.

### 7.2 De dinero
1. **Timbres**: costo por comprobante; si el tenant no paga y la plataforma sí (D-01), necesita tope, alertas de saldo y bloqueo por abuso.
2. **Timbrado duplicado por reintento** → cobra dos timbres y genera dos CFDI. Mitigación: idempotencia y `consultarPorReferencia` antes de reintentar.
3. **Factura sin cobro** o cobro sin factura: el corte debe poder conciliar `facturado` vs `cobrado` por periodo.
4. **Reventa de timbres**: si la plataforma cobra timbres al tenant puede ser un servicio con implicaciones fiscales propias **[VALIDAR]**.

### 7.3 De seguridad
1. **CSD comprometido** = alguien emite facturas a nombre del cliente. Ver §2.3: cifrado autenticado, mínimo privilegio, auditoría, nunca al navegador, alerta ante carga/reemplazo.
2. **Ruta pública de autofactura**: enumeración de tickets, fuerza bruta de códigos, scraping de datos de venta → códigos largos, límite por IP/código, respuestas uniformes, CAPTCHA.
3. **Fuga de PII fiscal** (RFC, nombre, domicilio): aislamiento por `tenantId` en **toda** consulta (los specs de aislamiento aplican igual que al resto del POS), sin PII en logs, y aviso de privacidad (LFPDPPP).
4. **Cuenta de proveedor única compartida entre tenants**: un error de enrutamiento timbra con el emisor equivocado. El emisor se resuelve **siempre** desde la venta (sucursal → empresa → CSD), nunca desde un parámetro del cliente.
5. **Webhooks del proveedor** (estatus de cancelación): validar firma y origen; sin firma, no se aceptan.
6. **Dependencia del proveedor**: si cae, el ERP sigue vendiendo; las facturas quedan en cola con reintento (el cobro nunca depende de timbrar).

## 8. Fases y tamaño

| Fase | Contenido | Tamaño |
|---|---|---|
| **F0 — Fundamentos fiscales** | Campos de empresa/sucursal/producto/receptor, catálogos SAT, validadores locales, cifrado GCM de CSD y rotación de llave, pantalla de datos fiscales | **M** |
| **F1 — Motor CFDI + puerto + Mock** | `CfdiEntrada`, armado XML 4.0 + XSD, impuestos, máquina de estados, idempotencia, series y folios, bitácora | **L** |
| **F2 — PAC en sandbox** | Un adaptador real, timbrado, XML/PDF, errores traducidos, validación de receptor, saldo | **M** |
| **F3 — Caja y autofactura** | Solicitud desde la Terminal, perfil fiscal del cliente, ticket con código/QR, portal público seguro | **M** |
| **F4 — Cancelación, egreso, REP** | Cancelación con aceptación y estatus, nota de crédito por devolución, complemento de pago desde conciliación | **L** |
| **F5 — Facturación global** | Selección, exclusiones, aprobación, programación, candado anti-duplicado | **M** |
| **F6 — Membresías, mesas, mixtos, propinas** | Reglas de §4 y specs de cuadre | **M** |
| **F7 — Producción** | Alta de emisores reales, monitoreo, alertas de saldo/vencimiento de CSD, runbook, segundo adaptador opcional | **S–M** |
| **Total** | | **≈ XL** (varios meses de un equipo pequeño; F0–F3 ya dan valor) |

Cada fase se entrega con specs de aislamiento por tenant, de permisos y de idempotencia, como el resto del backend.

## 9. Comparativa de 4 PAC con API y sandbox

> **Los precios, planes, límites y características cambian: verifícalos siempre en el sitio de cada proveedor y pide propuesta por escrito.** La tabla no contiene precios a propósito. Las características describen el tipo de oferta habitual de cada proveedor y **deben confirmarse** en su documentación antes de decidir.

| Criterio | Facturapi | Facturama | SW (Smarter Web / sapien) | Finkok |
|---|---|---|---|---|
| Estilo de API | REST moderna, JSON | REST, JSON | REST/JSON y servicios clásicos | SOAP y REST |
| Sandbox / pruebas | Sí (modo de pruebas) | Sí | Sí | Sí (ambiente demo) |
| Manejo de CSD | Lo puede resguardar el proveedor | Lo puede resguardar el proveedor | Lo puede resguardar el proveedor | Normalmente se envía por solicitud (verificar) |
| Multi-emisor (SaaS con muchos negocios) | Pensado para ello (organizaciones) | Soportado | Soportado | Soportado (subcuentas) |
| Cancelación con aceptación y estatus | Sí | Sí | Sí | Sí |
| Complemento de pago / global | Sí (verificar global) | Sí | Sí | Sí |
| SDK Node.js | Oficial | Comunitario/ejemplos | Ejemplos | Ejemplos |
| Encaje con este diseño | Muy alto: modelo JSON → CFDI y custodia delegable | Alto | Alto | Medio: más trabajo de integración |

**Criterios para elegir (sin precios):** modelo multi-emisor y su costo operativo por emisor; quién custodia el CSD; calidad del sandbox y de la documentación; cobertura de REP, global y cancelación con aceptación; latencia y SLA publicado; límites de tasa; soporte en español y tiempos de respuesta; facilidad de salida (exportar XML y emisores); y tratamiento de la reventa de timbres.

**Recomendación de proceso:** construir F0–F1 con el `Mock`, hacer una **prueba de concepto de 1 semana con 2 PAC** en sandbox (timbrar los mismos 10 casos: venta simple, IVA 8 %, descuento, pago mixto, global, egreso, REP, cancelación con y sin aceptación) y decidir con evidencia, no con folletos.

## 10. Decisiones que necesito de ti (lista única)

| # | Decisión | Opciones / por qué importa |
|---|---|---|
| **D-01** | ¿Quién paga los timbres: cada negocio (con su cuenta de PAC) o la plataforma (y se los cobra)? | Cambia el modelo de proveedor, el cobro y las implicaciones fiscales de revender. |
| **D-02** | ¿Quién custodia el CSD: el ERP (cifrado propio) o el PAC? | Seguridad vs. dependencia. Define la fase 0. |
| **D-03** | ¿Qué PAC(s) evaluamos en la prueba de concepto (de los 4 u otros)? | Fija el primer adaptador. |
| **D-04** | Propinas: ¿fuera del CFDI (recomendado) o dentro como concepto? | Criterio fiscal; requiere al contador. |
| **D-05** | Pago mixto: ¿forma de mayor monto con PUE, o `99` + PPD con REP por forma? | Cantidad de CFDI y exactitud. |
| **D-06** | Devolución con CFDI vigente: ¿egreso (nota de crédito) siempre, o cancelación cuando sea posible? | Depende del mes y de la aceptación del receptor. |
| **D-07** | Plazo y regla de autofactura (días, caducidad del código, qué pasa si la venta ya entró a la global). | Evita doble facturación. |
| **D-08** | Global: ¿automática con aprobación de un gerente, o solo manual? ¿Periodicidad por defecto? | Control y carga operativa. |
| **D-09** | Cuenta dividida "entre N" sin ítems: ¿concepto proporcional o concepto único de consumo? | Criterio fiscal. |
| **D-10** | Redondeo: ¿el CFDI manda y el ticket se ajusta, o se recalcula la venta por concepto? | Diferencias de centavos entre ticket y CFDI. |
| **D-11** | ¿Qué roles pueden facturar, cancelar y emitir global? | Permisos nuevos. |
| **D-12** | ¿Giros iniciales y su catálogo de claves SAT sugerido (restaurante, retail, gimnasio)? | Acelera la captura de productos. |
| **D-13** | ¿Se factura a socios de membresía desde el perfil del socio y se envía por correo, WhatsApp o ambos? | Define `MessagingProvider`. |
| **D-14** | ¿Contador que valide las reglas marcadas [VALIDAR] antes de F3? | Sin esto, F3 no debería salir a producción. |
| **D-15** | ¿Retención del XML y del PDF (mínimo 5 años) y almacenamiento (el actual o uno dedicado)? | Costo y cumplimiento. |

## 11. Estado de la implementación

- **F0** (datos fiscales, `PacProvider` + Mock): hecho y en producción (tablas `fiscal_emisores`, `fiscal_sucursales`, `fiscal_productos`, `receptores_fiscales`).
- **F1 preparada** (rama `feat/cfdi-f1`; **SQL sin ejecutar**: `facturacion-f1-migration.sql`): CSD cifrado con `ENCRYPTION_KEY` (AES-256-GCM versionado, contexto tenant|empresa, rotación con `ENCRYPTION_KEY_PREVIOUS`; carga solo ADMIN, validación local de `.cer`/`.key`/contraseña/RFC/vigencia; nada de la llave sale por la API); tablas `facturas`, `factura_ventas` (candado anti-doble facturación), `factura_eventos`, `fiscal_series` (folio atómico); factura desde una venta de caja (`POST /facturacion/facturas/desde-venta/:ventaId`); nota de crédito total o por partidas; cancelación (motivos 01–04); reintento de `INCIERTO` consultando primero por referencia; reportes (facturado vs. cobrado). **Todo con el Mock y marcado `sinValidezFiscal`** (restricción `CHECK` en la base de datos). «Facturación activa» bloqueada en el servidor (`facturacion-limites.ts`).
- **No incluido en F1** (para fases siguientes): pantalla de facturación en el ERP/Terminal, devolución del POS → nota de crédito automática (hoy se emite aparte; el cobro y `returnSale` no se tocaron), autofactura pública, global, complemento de pago, adaptador de PAC real, almacenamiento del XML fuera de la fila.
- Límite del Mock: guarda su estado en memoria del proceso; tras un reinicio no puede cancelar comprobantes emitidos antes (un PAC real sí).
- Las claves SAT de producto siguen **vacías** hasta que el contador las entregue (`docs/RESUMEN-CONTADOR-CFDI.md`): sin ellas una venta real responde 422 «falta la clave SAT de…».

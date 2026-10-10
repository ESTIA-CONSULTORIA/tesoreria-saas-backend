import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export interface SaleItem {
  productoId: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  // Importe de la línea SIN IVA y después de su descuento por ítem (con precios que incluyen IVA, ya desglosado).
  subtotal: number;
  // Tasa con la que se vendió la línea y si el precio del catálogo la incluía. Las pone SOLO el servidor al vender: una
  // devolución y el corte usan estas, no la configuración vigente. Una línea sin ellas es de antes (16 %, IVA no incluido).
  tasaIva?: string;
  ivaIncluido?: boolean;
  // Marcas SOLO del servidor (create()/agregarItems() descartan cualquier valor que mande el
  // cliente). POS flexible, capacidad mesas_cuenta_abierta:
  //  - notaCocinaId: este ítem ya salió a cocina/barra (tiene NotaCocina emitida). Al cancelar la
  //    cuenta o quitar el ítem NO se devuelve stock y se registra merma.
  //  - anulado: el ítem se quitó de la cuenta abierta. Se conserva la línea (no se borra) para que
  //    los índices usados al dividir la cuenta por ítems no se desplacen entre dos cajeros.
  notaCocinaId?: string;
  anulado?: boolean;
}

@Entity()
export class Sale {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  folio: string;

  @Column({ type: 'date' })
  fecha: Date;

  @Column({ type: 'time' })
  hora: string;

  @Column({ type: 'json' })
  items: SaleItem[];

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  descuento: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  impuestos: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  total: number;

  @Column({ default: 'EFECTIVO' })
  formaPago: 'EFECTIVO' | 'TARJETA' | 'DEBITO' | 'CREDITO' | 'TRANSFERENCIA' | 'CORTESIA';

  @Column({ type: 'json', nullable: true })
  formasPago: Array<{
    forma: 'EFECTIVO' | 'TARJETA' | 'DEBITO' | 'CREDITO' | 'TRANSFERENCIA' | 'CORTESIA';
    monto: number;
    ultimos4Digitos?: string;
    folioVoucher?: string;
    claveRastreo?: string;
    bancoOrigen?: string;
    motivo?: string;
    autorizadoPor?: string;
    // POS flexible, capacidad mesas_cuenta_abierta: pagos parciales de una cuenta abierta. Cada
    // entrada es un cobro (una persona / un grupo de ítems); itemIndexes son las posiciones en
    // `items` que ese cobro cubre (cuando se divide por ítems). Es JSON: sin migración.
    itemIndexes?: number[];
    montoRecibido?: number;
    cambio?: number;
    // Cuentas de mesa: quién cobró este pago (estampado en el servidor desde el token) y desde dónde. origen CAJA =
    // sesión ERP con ADMIN/GERENTE/CAJERO; MESA = POS Lite, o ERP con MESERO/CAPITAN. dividido: este pago es parte de
    // un cobro dividido (parcial, por persona o por ítems) y divididoPor* es quien lo dividió. Es JSON: sin migración.
    cobradoPorId?: string;
    cobradoPorEmail?: string;
    cobradoPorRol?: string;
    origen?: 'CAJA' | 'MESA';
    dividido?: boolean;
    divididoPorId?: string;
    divididoPorEmail?: string;
  }>;

  @Column({ default: 'ABIERTA' })
  // 'DEVUELTA': venta PAGADA ya devuelta (no repetible). 'DEVOLUCION': el registro de esa devolución
  // (referencia = folio de la original, total positivo, turno donde se hizo). Columna varchar: sin migración.
  status: 'ABIERTA' | 'PAGADA' | 'CANCELADA' | 'DEVUELTA' | 'DEVOLUCION';

  @Column({ nullable: true })
  cajero: string; // userId

  @Column({ nullable: true })
  turnoId: string;

  @Column({ nullable: true })
  sucursalId: string;

  @Column({ nullable: true })
  tenantId: string;

  @Column({ type: 'text', nullable: true })
  notas: string;

  @Column({ nullable: true })
  referencia: string;

  @Column({ type: 'text', nullable: true })
  motivoCancelacion: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  montoRecibido: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  cambio: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  costoReal: number;

  @Column({ type: 'varchar', nullable: true })
  tableId: string | null;

  // POS flexible, capacidad ligar_venta_a_cita: cita a la que pertenece esta venta. Varchar
  // simple sin FK real, mismo patrón que Cita.patientId / Consulta.patientId — la referencia
  // se valida a nivel de servicio (SalesService.create()). Opcional: NULL en toda venta normal.
  // Una cita puede tener varias ventas ligadas (pagos parciales), por eso no hay unicidad.
  @Column({ type: 'varchar', nullable: true })
  citaId: string | null;

  // Origen de la venta: 'POS' (default, ventas de siempre) o 'DELIVERY' (ingest de
  // DeliveryHub Pro — ver DeliveryIngestService). Las columnas de abajo solo se llenan
  // cuando origin === 'DELIVERY'; quedan NULL/0 en toda venta POS existente y nueva.
  @Column({ default: 'POS' })
  origin: 'POS' | 'DELIVERY';

  @Column({ nullable: true })
  platform: string;

  @Column({ nullable: true })
  externalOrderId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  platformCommission: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  netPayout: number;

  @Column({ type: 'timestamp', nullable: true })
  placedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export interface SaleItem {
  productoId: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  subtotal: number;
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
  }>;

  @Column({ default: 'ABIERTA' })
  status: 'ABIERTA' | 'PAGADA' | 'CANCELADA';

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

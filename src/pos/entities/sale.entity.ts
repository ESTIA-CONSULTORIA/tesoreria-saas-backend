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
  metodoPago: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'CORTESIA';

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

  @CreateDateColumn()
  createdAt: Date;
}

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Supplier } from '../../suppliers/entities/supplier.entity';

@Entity()
export class Purchase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: '' })
  numero: string;

  @Column({ type: 'date', nullable: true })
  fecha: string;

  @Column({ nullable: true })
  supplierId: string;

  @ManyToOne(() => Supplier)
  @JoinColumn({ name: 'supplierId' })
  supplier: Supplier;

  @Column({ nullable: true })
  ocId: string; // nullable, puede ser compra directa sin OC

  @Column({ type: 'json', nullable: true })
  items: any; // [{descripcion, cantidad, precioUnitario, subtotal}]

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  impuestos: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  total: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  montoPagado: number;

  @Column({ default: 'PENDIENTE' })
  status: string; // PENDIENTE/PAGADA/PARCIAL/CANCELADA

  @Column({ type: 'date', nullable: true })
  fechaVencimiento: string;

  @Column({ nullable: true })
  metodoPago: string;

  @Column({ nullable: true })
  diasCredito: number; // 0 = contado, 7, 15, 30, 45, 60 días

  @Column({ nullable: true })
  tenantId: string;

  @Column({ nullable: true })
  companyId: string;

  @CreateDateColumn()
  createdAt: Date;
}

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class PurchaseOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: '' })
  numero: string; // OC-0001

  @Column({ type: 'date', nullable: true })
  fecha: string;

  @Column({ nullable: true })
  supplierId: string;

  @Column({ default: 'BORRADOR' })
  status: string; // BORRADOR/ENVIADA/PARCIAL/RECIBIDA/CANCELACION_PENDIENTE/CANCELADA

  @Column({ type: 'json', nullable: true })
  statusHistory: any; // [{status, fecha, userId, motivo}]

  @Column({ nullable: true })
  motivoCancelacion: string;

  @Column({ type: 'json', nullable: true })
  items: any; // [{productoId, descripcion, cantidad, precioUnitario, subtotal}]

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  impuestos: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  total: number;

  @Column({ type: 'date', nullable: true })
  fechaEntregaEsperada: string;

  @Column({ nullable: true })
  notas: string;

  @Column({ nullable: true })
  tenantId: string;

  @Column({ nullable: true })
  branchId: string;

  @CreateDateColumn()
  createdAt: Date;
}

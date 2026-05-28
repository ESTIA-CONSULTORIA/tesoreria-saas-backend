import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum InvoiceType {
  EMITIDA = 'EMITIDA',
  RECIBIDA = 'RECIBIDA',
}

export enum InvoiceStatus {
  PAGADA = 'PAGADA',
  PENDIENTE_COBRO = 'PENDIENTE_COBRO',
  PENDIENTE_PAGO = 'PENDIENTE_PAGO',
}

export enum ReconciliationStatus {
  CONCILIADA = 'CONCILIADA',
  PENDIENTE = 'PENDIENTE',
  NO_CONCILIADA = 'NO_CONCILIADA',
}

@Entity()
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  invoiceNumber: string;

  @Column({
    type: 'enum',
    enum: InvoiceType,
  })
  type: InvoiceType;

  @Column({
    type: 'enum',
    enum: InvoiceStatus,
    default: InvoiceStatus.PENDIENTE_PAGO,
  })
  status: InvoiceStatus;

  @Column({
    type: 'enum',
    enum: ReconciliationStatus,
    default: ReconciliationStatus.PENDIENTE,
  })
  reconciliationStatus: ReconciliationStatus;

  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;

  @Column({ nullable: true })
  accountId?: string;

  @Column({ nullable: true })
  bankAccountId?: string;

  @Column({ nullable: true })
  movementId?: string;

  @Column()
  dueDate: Date;

  @Column({ nullable: true })
  paymentDate?: Date;

  @Column({ nullable: true })
  concept?: string;

  @Column({ default: false })
  needsManualReview: boolean;

  @CreateDateColumn()
  createdAt: Date;
}

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class Movement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  accountId: string;

  @Column()
  type: string; // INCOME o EXPENSE

  @Column({ default: '' })
  category: string; // SALE, RENT, PAYROLL, TRANSFER, etc.

  @Column({ nullable: true })
  categoryId: string;

  @Column({ default: '' })
  concept: string;

  @Column({ nullable: true })
  reference: string;

  @Column({ type: 'decimal', default: 0 })
  amount: number;

  @Column({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP' })
  date: Date;

  @Column({ default: 'APPROVED' })
  status: string; // APPROVED | PENDING_APPROVAL | REJECTED

  @Column({ nullable: true })
  approvedBy: string;

  @Column({ type: 'timestamp', nullable: true })
  approvedAt: Date;

  @Column({ nullable: true })
  rejectionReason: string;

  // Auditoría de seguridad (GoodsHabits, verificación PurchasesPage/useAuthStore, Hallazgo
  // 2): quién generó este movimiento — hoy solo lo usa
  // PurchasesService.registerPayment() (pasa el userId real de useAuthStore, no del JWT
  // manual). Nullable: los movimientos manuales vía POST /movements directo no lo mandan
  // todavía; extenderlo ahí es un frente aparte, no parte de este hallazgo. A nivel
  // Movement, no Purchase — una factura puede recibir varios pagos parciales de personas
  // distintas, así que solo el evento individual (este movimiento) puede decir quién lo
  // hizo; un campo único en Purchase perdería esa trazabilidad en pagos parciales.
  @Column({ nullable: true })
  createdBy: string;

  @CreateDateColumn()
  createdAt: Date;
}
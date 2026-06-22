import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class PayrollRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  companyId: string;

  @Column()
  branchId: string;

  @Column()
  periodStart: string; // YYYY-MM-DD

  @Column()
  periodEnd: string; // YYYY-MM-DD

  @Column({ default: 'QUINCENAL' })
  periodType: string; // SEMANAL | QUINCENAL | MENSUAL

  @Column({ default: 'PRENOMINA' })
  status: string; // PRENOMINA | APROBADA | PAGADA

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ nullable: true })
  approvedBy: string;

  @Column({ nullable: true })
  approvedAt: Date;

  @Column({ nullable: true })
  paidFromBankId: string;

  @Column({ nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

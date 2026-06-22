import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class PayrollEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  payrollRunId: string;

  @Column()
  employeeId: string;

  @Column()
  tenantId: string;

  @Column({ type: 'int', default: 0 })
  workedDays: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  dailySalary: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalPerceptions: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalDeductions: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  netAmount: number;

  @Column({ type: 'jsonb', nullable: true })
  concepts: any[]; // [{ name, type: 'P'|'D', amount, saved: boolean }]

  @Column({ default: 'PENDIENTE' })
  status: string; // PENDIENTE | REVISADO | PAGADO

  @CreateDateColumn()
  createdAt: Date;
}

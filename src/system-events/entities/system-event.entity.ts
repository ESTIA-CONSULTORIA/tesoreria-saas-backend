import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class SystemEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ nullable: true })
  companyId: string;

  @Column({ nullable: true })
  branchId: string;

  @Column()
  type: string; // SYNC_FAILED, RECONCILIATION_DIFFERENCE, PAYMENT_OVERDUE, LOW_STOCK

  @Column({ default: 'INFO' })
  severity: string; // INFO, WARNING, CRITICAL

  @Column()
  title: string;

  @Column({ nullable: true })
  message: string;

  @Column({ type: 'jsonb', nullable: true })
  payload: any;

  @Column({ default: 'OPEN' })
  status: string; // OPEN, ACKNOWLEDGED, CLOSED

  @Column({ nullable: true })
  acknowledgedAt: Date;

  @Column({ nullable: true })
  closedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}

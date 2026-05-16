import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class KpiSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ nullable: true })
  companyId: string;

  @Column({ nullable: true })
  branchId: string;

  @Column()
  metric: string; // SALES, CASH_FLOW, INVENTORY_VALUE, EBITDA

  @Column({ type: 'decimal', default: 0 })
  value: number;

  @Column({ nullable: true })
  periodType: string; // DAILY, WEEKLY, MONTHLY

  @Column({ nullable: true })
  periodReference: string; // 2026-05, 2026-W20

  @Column({ type: 'jsonb', nullable: true })
  metadata: any;

  @CreateDateColumn()
  createdAt: Date;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class Job {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ nullable: true })
  companyId: string;

  @Column({ nullable: true })
  branchId: string;

  @Column()
  name: string;

  @Column()
  type: string; // SYNC_QUEUE, RECONCILIATION, KPI_REFRESH, INTEGRATION_HEALTH_CHECK

  @Column({ default: 'MANUAL' })
  scheduleType: string; // MANUAL, INTERVAL, DAILY, HOURLY

  @Column({ nullable: true })
  intervalMinutes: number;

  @Column({ default: 'ACTIVE' })
  status: string; // ACTIVE, PAUSED, DISABLED

  @Column({ nullable: true })
  lastRunAt: Date;

  @Column({ nullable: true })
  nextRunAt: Date;

  @Column({ nullable: true })
  lastStatus: string; // SUCCESS, ERROR

  @Column({ nullable: true })
  lastError: string;

  @Column({ type: 'jsonb', nullable: true })
  config: any;

  @CreateDateColumn()
  createdAt: Date;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class SyncQueue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  companyId: string;

  @Column({ nullable: true })
  branchId: string;

  @Column()
  module: string; // SALES, INVENTORY, TREASURY, POS

  @Column()
  operationType: string; // CREATE, UPDATE, DELETE

  @Column({ type: 'jsonb' })
  payload: any;

  @Column({ default: 'PENDING' })
  status: string; // PENDING, PROCESSING, SYNCED, ERROR

  @Column({ nullable: true })
  deviceId: string;

  @Column({ default: 0 })
  retryCount: number;

  @Column({ default: 5 })
  maxRetries: number;

  @Column({ nullable: true })
  nextRetryAt: Date;

  @Column({ nullable: true })
  syncedAt: Date;

  @Column({ nullable: true })
  errorMessage: string;

  @CreateDateColumn()
  createdAt: Date;
}

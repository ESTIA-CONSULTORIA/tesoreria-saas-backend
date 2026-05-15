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
  status: string; // PENDING, SYNCED, ERROR

  @Column({ nullable: true })
  deviceId: string;

  @Column({ nullable: true })
  syncedAt: Date;

  @Column({ nullable: true })
  errorMessage: string;

  @CreateDateColumn()
  createdAt: Date;
}

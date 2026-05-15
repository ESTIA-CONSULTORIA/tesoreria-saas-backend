import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ nullable: true })
  companyId: string;

  @Column({ nullable: true })
  branchId: string;

  @Column({ nullable: true })
  userId: string;

  @Column({ nullable: true })
  deviceId: string;

  @Column()
  module: string; // AUTH, TREASURY, POS, INVENTORY, SYNC, INTEGRATIONS

  @Column()
  action: string; // CREATE, UPDATE, DELETE, LOGIN, SYNC, ERROR

  @Column({ nullable: true })
  entityName: string;

  @Column({ nullable: true })
  entityId: string;

  @Column({ type: 'jsonb', nullable: true })
  before: any;

  @Column({ type: 'jsonb', nullable: true })
  after: any;

  @Column({ type: 'jsonb', nullable: true })
  metadata: any;

  @Column({ nullable: true })
  ipAddress: string;

  @CreateDateColumn()
  createdAt: Date;
}

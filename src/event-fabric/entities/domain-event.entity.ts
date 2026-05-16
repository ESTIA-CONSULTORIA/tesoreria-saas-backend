import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class DomainEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ nullable: true })
  companyId: string;

  @Column({ nullable: true })
  branchId: string;

  @Column()
  eventName: string;

  @Column({ nullable: true })
  aggregateType: string;

  @Column({ nullable: true })
  aggregateId: string;

  @Column({ type: 'jsonb', nullable: true })
  payload: any;

  @Column({ type: 'jsonb', nullable: true })
  metadata: any;

  @Column({ default: 'PUBLISHED' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;
}

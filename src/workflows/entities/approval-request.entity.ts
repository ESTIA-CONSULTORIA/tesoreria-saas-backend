import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class ApprovalRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  companyId: string;

  @Column({ nullable: true })
  branchId: string;

  @Column()
  requestedByUserId: string;

  @Column()
  approvalType: string;

  @Column()
  referenceType: string;

  @Column({ nullable: true })
  referenceId: string;

  @Column({ type: 'decimal', default: 0 })
  amount: number;

  @Column({ default: 'PENDING' })
  status: string;

  @Column({ nullable: true })
  reason: string;

  @Column({ type: 'jsonb', nullable: true })
  payload: any;

  @CreateDateColumn()
  createdAt: Date;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class Permission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ nullable: true })
  companyId: string;

  @Column({ nullable: true })
  branchId: string;

  @Column()
  role: string;

  @Column()
  module: string;

  @Column()
  action: string;

  @Column({ default: true })
  allowed: boolean;

  @Column({ nullable: true })
  approvalLevel: string;

  @CreateDateColumn()
  createdAt: Date;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class AccountPayable {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  companyId: string;

  @Column()
  supplierId: string;

  @Column({ nullable: true })
  purchaseId: string;

  @Column({ type: 'decimal', default: 0 })
  originalAmount: number;

  @Column({ type: 'decimal', default: 0 })
  balance: number;

  @Column({ nullable: true })
  dueDate: Date;

  @Column({ default: 'PENDING' })
  status: string;

  @Column({ default: 'MXN' })
  currency: string;

  @CreateDateColumn()
  createdAt: Date;
}

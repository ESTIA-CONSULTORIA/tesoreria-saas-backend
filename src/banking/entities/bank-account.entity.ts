import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class BankAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  companyId: string;

  @Column()
  bankName: string;

  @Column()
  accountName: string;

  @Column({ nullable: true })
  accountNumber: string;

  @Column({ nullable: true })
  currency: string;

  @Column({ type: 'decimal', default: 0 })
  currentBalance: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class BankTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  bankAccountId: string;

  @Column()
  transactionDate: Date;

  @Column()
  movementType: string;

  @Column({ type: 'decimal', default: 0 })
  amount: number;

  @Column({ nullable: true })
  reference: string;

  @Column({ nullable: true })
  description: string;

  @Column({ default: 'PENDING' })
  reconciliationStatus: string;

  @CreateDateColumn()
  createdAt: Date;
}

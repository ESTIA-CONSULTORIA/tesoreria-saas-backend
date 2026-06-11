import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class Movement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  accountId: string;

  @Column()
  type: string; // INCOME o EXPENSE

  @Column({ default: '' })
  category: string; // SALE, RENT, PAYROLL, TRANSFER, etc.

  @Column({ nullable: true })
categoryId: string;

  @Column({ default: '' })
  concept: string;

  @Column({ nullable: true })
  reference: string;

  @Column({ type: 'decimal', default: 0 })
  amount: number;

  @Column({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP' })
  date: Date;

  @CreateDateColumn()
  createdAt: Date;
}
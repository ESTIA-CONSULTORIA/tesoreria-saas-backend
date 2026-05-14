import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class Movement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  accountId: string;

  @Column()
  type: string; // INCOME o EXPENSE

  @Column()
  category: string; // SALE, RENT, PAYROLL, TRANSFER, etc.

  @Column({ nullable: true })
categoryId: string;

  @Column()
  concept: string;

  @Column({ nullable: true })
  reference: string;

  @Column({ type: 'decimal' })
  amount: number;

  @CreateDateColumn()
  createdAt: Date;
}
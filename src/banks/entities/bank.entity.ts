import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class Bank {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  branchId: string;

  @Column()
  name: string;

  @Column()
  accountNumber: string;

  @Column()
  bank: string;

  @Column({ type: 'decimal', default: 0 })
  initialBalance: number;

  @Column({ type: 'decimal', default: 0 })
  balance: number;

  @Column({ default: 'MXN' })
  currency: string;

  @Column()
  type: string; // EFECTIVO | BANCO | CAJA

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}

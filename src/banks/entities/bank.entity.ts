import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class Bank {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  branchId: string;

  @Column({ default: '' })
  name: string;

  @Column({ default: '' })
  accountNumber: string;

  @Column({ default: '' })
  bank: string;

  @Column({ type: 'decimal', default: 0 })
  initialBalance: number;

  @Column({ type: 'decimal', default: 0 })
  balance: number;

  @Column({ default: 'MXN' })
  currency: string;

  @Column({ default: 'EFECTIVO' })
  type: string; // EFECTIVO | BANCO | CAJA

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}

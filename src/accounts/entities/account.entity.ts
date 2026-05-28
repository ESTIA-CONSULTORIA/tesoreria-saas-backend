import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  branchId: string;

  @Column({ default: '' })
  name: string;

  @Column({ default: 'CASH' })
  type: string; // CASH, BANK, CARD

  @Column({ default: 'MXN' })
  currency: string;

  @Column({ type: 'decimal', default: 0 })
  balance: number;

  @Column({ default: true })
  isActive: boolean;
}
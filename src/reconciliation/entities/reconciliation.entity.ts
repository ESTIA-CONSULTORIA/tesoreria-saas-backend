import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class Reconciliation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  companyId: string;

  @Column({ nullable: true })
  branchId: string;

  @Column()
  sourceType: string; // POS, BANK, INVENTORY, ACCOUNTING

  @Column()
  sourceProvider: string; // SOFTRESTAURANT, SIERRA, BANREGIO, CSV

  @Column()
  reference: string;

  @Column({ type: 'decimal', default: 0 })
  externalAmount: number;

  @Column({ type: 'decimal', default: 0 })
  internalAmount: number;

  @Column({ type: 'decimal', default: 0 })
  difference: number;

  @Column({ default: 'PENDING' })
  status: string; // PENDING, MATCHED, DIFFERENCE, RESOLVED

  @Column({ nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;
}

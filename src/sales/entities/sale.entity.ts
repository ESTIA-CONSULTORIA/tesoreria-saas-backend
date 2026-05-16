import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class Sale {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  companyId: string;

  @Column()
  branchId: string;

  @Column({ nullable: true })
  externalId: string;

  @Column({ nullable: true })
  sourceProvider: string; // INTERNAL_POS, SOFTRESTAURANT, SIERRA, CSV

  @Column({ nullable: true })
  cashierId: string;

  @Column({ nullable: true })
  customerId: string;

  @Column({ type: 'decimal', default: 0 })
  subtotal: number;

  @Column({ type: 'decimal', default: 0 })
  taxes: number;

  @Column({ type: 'decimal', default: 0 })
  discounts: number;

  @Column({ type: 'decimal', default: 0 })
  tips: number;

  @Column({ type: 'decimal', default: 0 })
  total: number;

  @Column({ default: 'MXN' })
  currency: string;

  @Column({ default: 'COMPLETED' })
  status: string; // DRAFT, COMPLETED, CANCELLED, REFUNDED

  @Column({ type: 'jsonb', nullable: true })
  metadata: any;

  @CreateDateColumn()
  createdAt: Date;
}

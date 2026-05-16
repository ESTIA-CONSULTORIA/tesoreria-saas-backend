import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class Purchase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  companyId: string;

  @Column()
  branchId: string;

  @Column()
  supplierId: string;

  @Column({ nullable: true })
  invoiceNumber: string;

  @Column({ type: 'decimal', default: 0 })
  subtotal: number;

  @Column({ type: 'decimal', default: 0 })
  taxes: number;

  @Column({ type: 'decimal', default: 0 })
  total: number;

  @Column({ default: 'PENDING' })
  status: string;

  @Column({ nullable: true })
  paymentStatus: string;

  @Column({ nullable: true })
  dueDate: Date;

  @Column({ default: 'MXN' })
  currency: string;

  @CreateDateColumn()
  createdAt: Date;
}

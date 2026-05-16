import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  companyId: string;

  @Column()
  branchId: string;

  @Column({ unique: false })
  sku: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  category: string;

  @Column({ default: 'PRODUCT' })
  type: string; // PRODUCT, INGREDIENT, RECIPE, SERVICE

  @Column({ type: 'decimal', default: 0 })
  stock: number;

  @Column({ type: 'decimal', default: 0 })
  minimumStock: number;

  @Column({ type: 'decimal', default: 0 })
  averageCost: number;

  @Column({ type: 'decimal', default: 0 })
  salePrice: number;

  @Column({ default: 'MXN' })
  currency: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: any;

  @CreateDateColumn()
  createdAt: Date;
}

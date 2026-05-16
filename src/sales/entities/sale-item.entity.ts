import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class SaleItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  saleId: string;

  @Column()
  productId: string;

  @Column({ nullable: true })
  sku: string;

  @Column()
  name: string;

  @Column({ type: 'decimal', default: 0 })
  quantity: number;

  @Column({ type: 'decimal', default: 0 })
  unitPrice: number;

  @Column({ type: 'decimal', default: 0 })
  total: number;

  @Column({ type: 'decimal', default: 0 })
  cost: number;

  @Column({ type: 'decimal', default: 0 })
  margin: number;

  @Column({ type: 'jsonb', nullable: true })
  modifiers: any;

  @CreateDateColumn()
  createdAt: Date;
}

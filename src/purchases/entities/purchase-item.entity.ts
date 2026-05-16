import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class PurchaseItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  purchaseId: string;

  @Column()
  productId: string;

  @Column()
  name: string;

  @Column({ type: 'decimal', default: 0 })
  quantity: number;

  @Column({ type: 'decimal', default: 0 })
  unitCost: number;

  @Column({ type: 'decimal', default: 0 })
  total: number;

  @CreateDateColumn()
  createdAt: Date;
}

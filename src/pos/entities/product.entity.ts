import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { PosCategory } from './category.entity';

@Entity()
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  branchId: string;

  @Column({ nullable: true })
  tenantId: string;

  @Column({ nullable: true })
  categoryId: string;

  @ManyToOne(() => PosCategory, category => category.products, { nullable: true })
  @JoinColumn({ name: 'categoryId' })
  category: PosCategory;

  @Column({ default: '' })
  name: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  price: number;

  @Column({ nullable: true })
  imageUrl: string;

  @Column({ default: 'SIMPLE' })
  type: string; // SIMPLE (retail) or PREPARADO (recipe)

  @Column({ nullable: true })
  recipeId: string; // For PREPARADO type

  @Column({ nullable: true })
  insumoId: string; // For SIMPLE type

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

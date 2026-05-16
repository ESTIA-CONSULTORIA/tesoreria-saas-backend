import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class RecipeItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  recipeId: string;

  @Column()
  ingredientProductId: string;

  @Column()
  ingredientName: string;

  @Column({ type: 'decimal', default: 0 })
  quantity: number;

  @Column({ nullable: true })
  unit: string;

  @Column({ type: 'decimal', default: 0 })
  estimatedCost: number;

  @CreateDateColumn()
  createdAt: Date;
}

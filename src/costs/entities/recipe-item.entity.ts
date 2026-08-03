import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Check } from 'typeorm';
import { Recipe } from './recipe.entity';
import { Insumo } from './insumo.entity';

@Entity()
@Check(`("insumoId" IS NOT NULL AND "componentRecipeId" IS NULL) OR ("insumoId" IS NULL AND "componentRecipeId" IS NOT NULL)`)
export class RecipeItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  recipeId: string;

  @ManyToOne(() => Recipe, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recipeId' })
  recipe: Recipe;

  @Column({ nullable: true })
  insumoId: string;

  @ManyToOne(() => Insumo, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'insumoId' })
  insumo: Insumo;

  @Column({ nullable: true })
  componentRecipeId: string;

  @ManyToOne(() => Recipe, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'componentRecipeId' })
  componentRecipe: Recipe;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  cantidad: number;

  @Column()
  unidadMedida: string;

  @Column({ nullable: true })
  tenantId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

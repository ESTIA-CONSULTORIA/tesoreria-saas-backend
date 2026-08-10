import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CostsController } from './costs.controller';
import { CostsService } from './costs.service';
import { Insumo } from './entities/insumo.entity';
import { Recipe } from './entities/recipe.entity';
import { RecipeItem } from './entities/recipe-item.entity';
import { Inventory } from './entities/inventory.entity';
import { InventoryMovement } from './entities/inventory-movement.entity';
import { PhysicalCount } from './entities/physical-count.entity';
import { Justifiable } from './entities/justifiable.entity';
import { Almacen } from './entities/almacen.entity';
import { FamiliaInsumo } from './entities/familia-insumo.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Insumo, Recipe, RecipeItem, Inventory, InventoryMovement, PhysicalCount, Justifiable, Almacen, FamiliaInsumo])],
  controllers: [CostsController],
  providers: [CostsService],
  exports: [CostsService],
})
export class CostsModule {}

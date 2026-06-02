import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CostsController } from './costs.controller';
import { CostsService } from './costs.service';
import { Insumo } from './entities/insumo.entity';
import { Recipe } from './entities/recipe.entity';
import { Inventory } from './entities/inventory.entity';
import { PhysicalCount } from './entities/physical-count.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Insumo, Recipe, Inventory, PhysicalCount])],
  controllers: [CostsController],
  providers: [CostsService],
  exports: [CostsService],
})
export class CostsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Recipe } from './entities/recipe.entity';
import { RecipeItem } from './entities/recipe-item.entity';
import { ProductionService } from './production.service';
import { ProductionController } from './production.controller';
import { RecipeConsumptionService } from './services/recipe-consumption.service';

@Module({
  imports: [TypeOrmModule.forFeature([Recipe, RecipeItem])],
  providers: [ProductionService, RecipeConsumptionService],
  controllers: [ProductionController],
  exports: [ProductionService, RecipeConsumptionService],
})
export class ProductionModule {}

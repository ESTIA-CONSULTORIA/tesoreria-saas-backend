import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { ProductionService } from './production.service';
import { Recipe } from './entities/recipe.entity';
import { RecipeItem } from './entities/recipe-item.entity';

@Controller('production')
export class ProductionController {
  constructor(private productionService: ProductionService) {}

  @Post('recipes')
  createRecipe(
    @Body()
    body: Partial<Recipe> & {
      items?: Partial<RecipeItem>[];
    },
  ) {
    return this.productionService.createRecipe(body);
  }

  @Get('recipes/:id')
  findRecipe(@Param('id') id: string) {
    return this.productionService.findRecipe(id);
  }
}

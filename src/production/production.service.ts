import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Recipe } from './entities/recipe.entity';
import { RecipeItem } from './entities/recipe-item.entity';

@Injectable()
export class ProductionService {
  constructor(
    @InjectRepository(Recipe)
    private recipesRepository: Repository<Recipe>,

    @InjectRepository(RecipeItem)
    private recipeItemsRepository: Repository<RecipeItem>,
  ) {}

  async createRecipe(
    data: Partial<Recipe> & {
      items?: Partial<RecipeItem>[];
    },
  ) {
    const recipe = this.recipesRepository.create(data);
    const savedRecipe = await this.recipesRepository.save(recipe);

    if (data.items?.length) {
      const items = data.items.map((item) =>
        this.recipeItemsRepository.create({
          ...item,
          recipeId: savedRecipe.id,
        }),
      );

      await this.recipeItemsRepository.save(items);
    }

    return this.findRecipe(savedRecipe.id);
  }

  async findRecipe(id: string) {
    const recipe = await this.recipesRepository.findOne({
      where: { id },
    });

    const items = await this.recipeItemsRepository.find({
      where: {
        recipeId: id,
      },
    });

    return {
      ...recipe,
      items,
    };
  }
}

import { Body, Controller, Get, Post } from '@nestjs/common';
import { CategoriesService } from './categories.service';

@Controller('categories')
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  @Post()
  create(
    @Body()
    body: {
      code: string;
      name: string;
      type: string;
    },
  ) {
    return this.categoriesService.create(
      body.code,
      body.name,
      body.type,
    );
  }

  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }
}
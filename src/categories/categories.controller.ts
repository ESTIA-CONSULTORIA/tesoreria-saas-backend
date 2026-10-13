import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CategoriesService } from './categories.service';

@Controller('categories')
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  // Tabla heredada GLOBAL (sin tenantId): escribirla desde un tenant la expondría a todos. Solo SOPORTE.
  @UseGuards(RolesGuard)
  @Roles('SOPORTE')
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
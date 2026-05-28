import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { CostsService } from './costs.service';
import { Modulo } from '../auth/modulo.decorator';

@Controller('costs')
@Modulo('costos')
export class CostsController {
  constructor(private costsService: CostsService) {}

  // Insumos
  @Get('insumos')
  findAllInsumos(@Param('tenantId') tenantId?: string) {
    return this.costsService.findAllInsumos(tenantId);
  }

  @Get('insumos/:id')
  findOneInsumo(@Param('id') id: string) {
    return this.costsService.findOneInsumo(id);
  }

  @Post('insumos')
  createInsumo(@Body() data: any) {
    return this.costsService.createInsumo(data);
  }

  @Put('insumos/:id')
  updateInsumo(@Param('id') id: string, @Body() data: any) {
    return this.costsService.updateInsumo(id, data);
  }

  @Delete('insumos/:id')
  deleteInsumo(@Param('id') id: string) {
    return this.costsService.deleteInsumo(id);
  }

  // Recetas
  @Get('recipes')
  findAllRecipes(@Param('tenantId') tenantId?: string) {
    return this.costsService.findAllRecipes(tenantId);
  }

  @Get('recipes/:id')
  findOneRecipe(@Param('id') id: string) {
    return this.costsService.findOneRecipe(id);
  }

  @Post('recipes')
  createRecipe(@Body() data: any) {
    return this.costsService.createRecipe(data);
  }

  @Put('recipes/:id')
  updateRecipe(@Param('id') id: string, @Body() data: any) {
    return this.costsService.updateRecipe(id, data);
  }

  @Delete('recipes/:id')
  deleteRecipe(@Param('id') id: string) {
    return this.costsService.deleteRecipe(id);
  }
}

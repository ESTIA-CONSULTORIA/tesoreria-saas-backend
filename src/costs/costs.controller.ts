import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { CostsService } from './costs.service';
import { Modulo } from '../auth/modulo.decorator';
import { InsumoFamilia } from './entities/insumo.entity';

@Controller('costs')
@Modulo('costos')
export class CostsController {
  constructor(private costsService: CostsService) {}

  // Insumos
  @Get('insumos')
  findAllInsumos(
    @Query('tenantId') tenantId?: string,
    @Query('categoriaId') categoriaId?: string,
  ) {
    return this.costsService.findAllInsumos(tenantId, categoriaId);
  }

  @Get('insumos/search')
  searchInsumos(
    @Query('search') search: string,
    @Query('limit') limit?: number,
  ) {
    return this.costsService.searchInsumos(search, limit);
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

  @Get('insumos/next-code')
  getNextInsumoCode(@Query('familia') familia: string) {
    return this.costsService.getNextInsumoCode(familia as InsumoFamilia);
  }

  // Recetas
  @Get('recipes')
  findAllRecipes(
    @Query('tenantId') tenantId?: string,
    @Query('tipo') tipo?: string,
  ) {
    return this.costsService.findAllRecipes(tenantId, tipo);
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

  // Inventario
  @Get('inventory')
  async findInventoryByPeriod(
    @Query('tenantId') tenantId?: string,
    @Query('periodo') periodo?: string,
  ) {
    return this.costsService.findInventoryByPeriod(tenantId, periodo);
  }

  @Get('inventory/:insumoId/:periodo')
  async findInventoryByInsumo(
    @Param('insumoId') insumoId: string,
    @Param('periodo') periodo: string,
  ) {
    return this.costsService.findInventoryByInsumo(insumoId, periodo);
  }

  @Post('inventory')
  async createInventory(@Body() data: any) {
    return this.costsService.createInventory(data);
  }

  @Put('inventory/:id')
  async updateInventory(@Param('id') id: string, @Body() data: any) {
    return this.costsService.updateInventory(id, data);
  }

  @Delete('inventory/:id')
  async deleteInventory(@Param('id') id: string) {
    return this.costsService.deleteInventory(id);
  }

  // Costo de Venta
  @Get('cost-of-sales')
  async calculateCostOfSales(
    @Query('tenantId') tenantId?: string,
    @Query('periodo') periodo?: string,
  ) {
    return this.costsService.calculateCostOfSales(tenantId, periodo);
  }

  // Conteo Físico
  @Get('physical-counts')
  async findPhysicalCounts(
    @Query('tenantId') tenantId?: string,
    @Query('insumoId') insumoId?: string,
  ) {
    return this.costsService.findPhysicalCounts(tenantId, insumoId);
  }

  @Get('physical-counts/period')
  async findPhysicalCountsByPeriod(
    @Query('fechaInicio') fechaInicio: string,
    @Query('fechaFin') fechaFin: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.costsService.findPhysicalCountsByPeriod(
      new Date(fechaInicio),
      new Date(fechaFin),
      tenantId,
    );
  }

  @Post('physical-counts')
  async createPhysicalCount(@Body() data: any) {
    return this.costsService.createPhysicalCount(data);
  }

  // Justificables
  @Get('justificables')
  async findJustificablesByPeriod(
    @Query('periodo') periodo: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.costsService.findJustificablesByPeriod(periodo, tenantId);
  }

  @Get('justificables/totals')
  async calculateTotalJustificables(
    @Query('periodo') periodo: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.costsService.calculateTotalJustificables(periodo, tenantId);
  }

  @Post('justificables')
  async createJustifiable(@Body() data: any) {
    return this.costsService.createJustifiable(data);
  }
}

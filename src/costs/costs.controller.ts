import { tenantDeSesion, tenantParaListar, tenantParaEscribir } from '../auth/tenant-access.util';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, Request } from '@nestjs/common';
import { CostsService } from './costs.service';
import { Modulo } from '../auth/modulo.decorator';
import { sucursalEfectiva } from '../common/sucursal-efectiva';

@Controller('costs')
@Modulo('costos')
export class CostsController {
  constructor(private costsService: CostsService) {}

  // Insumos
  @Get('insumos')
  findAllInsumos(
    @Query('tenantId') queryTenantId?: string,
    @Query('categoriaId') categoriaId?: string,
    @Request() req?: any,
  ) {
    const tenantId = tenantParaListar(req, queryTenantId);
    return this.costsService.findAllInsumos(tenantId, categoriaId);
  }

  @Get('insumos/search')
  searchInsumos(
    @Query('search') search: string,
    @Query('limit') limit?: number,
    @Query('tenantId') tenantIdQuery?: string,
    @Request() req?: any,
  ) {
    return this.costsService.searchInsumos(search, limit, tenantParaListar(req, tenantIdQuery));
  }

  @Get('insumos/next-code')
  getNextInsumoCode(@Query('familiaId') familiaId: string, @Request() req?: any) {
    return this.costsService.getNextInsumoCode(familiaId, tenantDeSesion(req));
  }

  @Get('insumos/:id')
  findOneInsumo(@Param('id') id: string, @Request() req?: any) {
    return this.costsService.findOneInsumo(id, tenantDeSesion(req));
  }

  @Post('insumos')
  createInsumo(@Body() data: any, @Request() req?: any) {
    const tenantId = tenantParaEscribir(req, req?.query?.tenantId);
    return this.costsService.createInsumo({ ...data, tenantId });
  }

  @Put('insumos/:id')
  updateInsumo(@Param('id') id: string, @Body() data: any, @Request() req?: any) {
    return this.costsService.updateInsumo(id, data, undefined, tenantDeSesion(req));
  }

  @Delete('insumos/:id')
  deleteInsumo(@Param('id') id: string, @Request() req?: any) {
    return this.costsService.deleteInsumo(id, tenantDeSesion(req));
  }

  @Post('insumos/:id/replace')
  replaceInsumo(@Param('id') id: string, @Body() data: { newInsumoId: string }, @Request() req?: any) {
    return this.costsService.replaceInsumo(id, data.newInsumoId, tenantDeSesion(req));
  }

  @Post('insumos/import')
  importInsumos(@Body() data: { insumos: any[] }, @Request() req?: any) {
    return this.costsService.importInsumos(data.insumos, tenantParaEscribir(req, req?.query?.tenantId));
  }

  // Almacenes
  @Get('almacenes')
  findAllAlmacenes(
    @Query('tenantId') queryTenantId?: string,
    @Query('sucursalId') sucursalId?: string,
    @Request() req?: any,
  ) {
    const tenantId = tenantParaListar(req, queryTenantId);
    return this.costsService.findAllAlmacenes(tenantId, sucursalEfectiva(req?.user, sucursalId).branchId);
  }

  @Get('almacenes/:id')
  findOneAlmacen(@Param('id') id: string, @Request() req?: any) {
    return this.costsService.findOneAlmacen(id, tenantDeSesion(req));
  }

  @Post('almacenes')
  createAlmacen(@Body() data: any, @Request() req?: any) {
    const tenantId = tenantParaEscribir(req, req?.query?.tenantId);
    return this.costsService.createAlmacen({ ...data, tenantId });
  }

  @Put('almacenes/:id')
  updateAlmacen(@Param('id') id: string, @Body() data: any, @Request() req?: any) {
    return this.costsService.updateAlmacen(id, data, tenantDeSesion(req));
  }

  @Delete('almacenes/:id')
  deleteAlmacen(@Param('id') id: string, @Request() req?: any) {
    return this.costsService.deleteAlmacen(id, tenantDeSesion(req));
  }

  // Familias de Insumos
  @Get('familias')
  findAllFamilias(@Query('tenantId') queryTenantId?: string, @Request() req?: any) {
    const tenantId = tenantParaListar(req, queryTenantId);
    return this.costsService.findAllFamilias(tenantId);
  }

  @Get('familias/:id')
  findOneFamilia(@Param('id') id: string, @Request() req?: any) {
    return this.costsService.findOneFamilia(id, tenantDeSesion(req));
  }

  @Post('familias')
  createFamilia(@Body() data: any, @Request() req?: any) {
    const tenantId = tenantParaEscribir(req, req?.query?.tenantId);
    return this.costsService.createFamilia({ ...data, tenantId });
  }

  @Put('familias/:id')
  updateFamilia(@Param('id') id: string, @Body() data: any, @Request() req?: any) {
    return this.costsService.updateFamilia(id, data, tenantDeSesion(req));
  }

  @Delete('familias/:id')
  deleteFamilia(@Param('id') id: string, @Request() req?: any) {
    return this.costsService.deleteFamilia(id, tenantDeSesion(req));
  }

  // Recetas
  @Get('recipes')
  findAllRecipes(
    @Query('tenantId') queryTenantId?: string,
    @Query('tipo') tipo?: string,
    @Request() req?: any,
  ) {
    const tenantId = tenantParaListar(req, queryTenantId);
    return this.costsService.findAllRecipes(tenantId, tipo);
  }

  @Get('recipes/:id')
  findOneRecipe(@Param('id') id: string, @Request() req?: any) {
    return this.costsService.findOneRecipe(id, tenantDeSesion(req));
  }

  @Post('recipes')
  createRecipe(@Body() data: any, @Request() req?: any) {
    const tenantId = tenantParaEscribir(req, req?.query?.tenantId);
    return this.costsService.createRecipe({ ...data, tenantId });
  }

  @Put('recipes/:id')
  updateRecipe(@Param('id') id: string, @Body() data: any, @Request() req?: any) {
    return this.costsService.updateRecipe(id, data, tenantDeSesion(req));
  }

  @Delete('recipes/:id')
  deleteRecipe(@Param('id') id: string, @Request() req?: any) {
    return this.costsService.deleteRecipe(id, tenantDeSesion(req));
  }

  @Post('recipes/import')
  importRecipes(@Body() data: { recetas: any[] }, @Request() req?: any) {
    return this.costsService.importRecipes(data.recetas, tenantParaEscribir(req, req?.query?.tenantId));
  }

  // RecipeItem (líneas de receta normalizadas)
  @Get('recipes/:id/items')
  findRecipeItems(@Param('id') id: string, @Request() req?: any) {
    return this.costsService.findRecipeItems(id, tenantDeSesion(req));
  }

  @Post('recipes/:id/items')
  createRecipeItem(@Param('id') id: string, @Body() data: any, @Request() req?: any) {
    const tenantId = tenantParaEscribir(req, req?.query?.tenantId);
    return this.costsService.createRecipeItem(id, { ...data }, tenantDeSesion(req));
  }

  @Put('recipe-items/:id')
  updateRecipeItem(@Param('id') id: string, @Body() data: any, @Request() req?: any) {
    return this.costsService.updateRecipeItem(id, data, tenantDeSesion(req));
  }

  @Delete('recipe-items/:id')
  deleteRecipeItem(@Param('id') id: string, @Request() req?: any) {
    return this.costsService.deleteRecipeItem(id, tenantDeSesion(req));
  }

  @Get('recipes/:id/cost')
  getRecipeCost(@Param('id') id: string, @Request() req?: any) {
    return this.costsService.getRecipeCost(id, tenantDeSesion(req));
  }

  // Inventario
  @Get('inventory')
  async findInventoryByPeriod(
    @Query('tenantId') tenantId?: string,
    @Query('periodo') periodo?: string,
    @Request() req?: any,
  ) {
    return this.costsService.findInventoryByPeriod(tenantParaListar(req, tenantId), periodo);
  }

  @Get('inventory/:insumoId/:periodo')
  async findInventoryByInsumo(
    @Param('insumoId') insumoId: string,
    @Param('periodo') periodo: string,
    @Request() req?: any,
  ) {
    return this.costsService.findInventoryByInsumo(insumoId, periodo, tenantParaListar(req, req?.query?.tenantId));
  }

  @Post('inventory')
  async createInventory(@Body() data: any, @Request() req?: any) {
    // El tenant sale del token; SOPORTE con ?tenantId= explícito. El del body se ignora.
    return this.costsService.createInventory({ ...data, tenantId: tenantParaEscribir(req, req?.query?.tenantId) });
  }

  @Put('inventory/:id')
  async updateInventory(@Param('id') id: string, @Body() data: any, @Request() req?: any) {
    return this.costsService.updateInventory(id, data, tenantDeSesion(req));
  }

  @Delete('inventory/:id')
  async deleteInventory(@Param('id') id: string, @Request() req?: any) {
    return this.costsService.deleteInventory(id, tenantDeSesion(req));
  }

  @Get('inventory-movements')
  findInventoryMovements(
    @Query('insumoId') insumoId?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('tenantId') queryTenantId?: string,
    @Request() req?: any,
  ) {
    const tenantId = tenantParaListar(req, queryTenantId);
    return this.costsService.findInventoryMovements(tenantId, { insumoId, desde, hasta });
  }

  // Costo de Venta
  @Get('cost-of-sales')
  async calculateCostOfSales(
    @Query('tenantId') tenantId?: string,
    @Query('periodo') periodo?: string,
    @Request() req?: any,
  ) {
    return this.costsService.calculateCostOfSales(tenantParaListar(req, tenantId), periodo);
  }

  // Conteo Físico
  @Get('physical-counts')
  async findPhysicalCounts(
    @Query('tenantId') tenantId?: string,
    @Query('insumoId') insumoId?: string,
    @Request() req?: any,
  ) {
    return this.costsService.findPhysicalCounts(tenantParaListar(req, tenantId), insumoId);
  }

  @Get('physical-counts/period')
  async findPhysicalCountsByPeriod(
    @Query('fechaInicio') fechaInicio: string,
    @Query('fechaFin') fechaFin: string,
    @Query('tenantId') tenantId?: string,
    @Request() req?: any,
  ) {
    return this.costsService.findPhysicalCountsByPeriod(
      new Date(fechaInicio),
      new Date(fechaFin),
      tenantParaListar(req, tenantId),
    );
  }

  @Post('physical-counts')
  async createPhysicalCount(@Body() data: any, @Request() req?: any) {
    const tenantId = tenantParaEscribir(req, req?.query?.tenantId);
    return this.costsService.createPhysicalCount({ ...data, tenantId });
  }

  // Justificables
  @Get('justificables')
  async findJustificablesByPeriod(
    @Query('periodo') periodo: string,
    @Query('tenantId') tenantId?: string,
    @Request() req?: any,
  ) {
    return this.costsService.findJustificablesByPeriod(periodo, tenantParaListar(req, tenantId));
  }

  @Get('justificables/totals')
  async calculateTotalJustificables(
    @Query('periodo') periodo: string,
    @Query('tenantId') tenantId?: string,
    @Request() req?: any,
  ) {
    return this.costsService.calculateTotalJustificables(periodo, tenantParaListar(req, tenantId));
  }

  @Post('justificables')
  async createJustifiable(@Body() data: any, @Request() req?: any) {
    // El tenant sale del token; SOPORTE con ?tenantId= explícito. El del body se ignora.
    const tenantId = tenantParaEscribir(req, req?.query?.tenantId);
    return this.costsService.createJustifiable({ ...data, tenantId });
  }
}

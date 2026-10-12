import { Controller, Get, Post, Put, Delete, Body, Headers, Param, Req } from '@nestjs/common';
import { ProductsService } from './products.service';
import { Modulo } from '../auth/modulo.decorator';
import { sucursalEfectiva, sucursalParaEscribir } from '../common/sucursal-efectiva';

@Controller('pos/products')
@Modulo('configuracion_pos')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Get()
  findAll(@Req() req: any, @Headers('x-branch-id') headerBranchId?: string, @Param('branchId') paramBranchId?: string) {
    const tenantId = req.user?.tenantId;
    // La sucursal sale del usuario (token); el header solo filtra para quien no tiene sucursal (ADMIN/dueño).
    const { branchId } = sucursalEfectiva(req.user, headerBranchId || paramBranchId);
    return this.productsService.findAll(branchId, tenantId);
  }

  // Insumos y recetas reales del tenant para los selectores de la pantalla de Productos. Va antes de :id.
  @Get('opciones-stock')
  opcionesStock(@Req() req: any) {
    return this.productsService.opcionesStock(req.user?.tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.productsService.findOne(id, tenantId);
  }

  @Post()
  create(@Body() data: any, @Req() req?: any, @Headers('x-branch-id') headerBranchId?: string) {
    // JWT primero; body.tenantId solo como fallback para SOPORTE (sin tenantId en su JWT) —
    // mismo criterio que cashiers/users/companies.
    const tenantId = req?.user?.tenantId || data?.tenantId;
    // Sucursal: la del usuario; sin sucursal (ADMIN) la pedida en el cuerpo o la activa del header, validada contra el tenant
    // en el servicio. Sin ninguna, el producto queda sin sucursal = compartido por todas las del negocio.
    // El cuerpo es explícito (otra sucursal para quien tiene la suya = 403); el header, que el cliente manda siempre, solo
    // cuenta para quien no tiene sucursal.
    const branchId = sucursalParaEscribir(req?.user, data?.branchId) ?? sucursalEfectiva(req?.user, headerBranchId).branchId;
    return this.productsService.create({ ...data, branchId: branchId ?? null }, tenantId);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: any, @Req() req?: any) {
    const tenantId = req?.user?.tenantId;
    // Mover un producto de sucursal solo hacia la propia (o una del tenant si no se tiene); el servicio valida el tenant.
    if (data && Object.prototype.hasOwnProperty.call(data, 'branchId') && data.branchId) {
      data = { ...data, branchId: sucursalParaEscribir(req?.user, data.branchId) };
    }
    return this.productsService.update(id, data, tenantId);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Req() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.productsService.delete(id, tenantId);
  }
}

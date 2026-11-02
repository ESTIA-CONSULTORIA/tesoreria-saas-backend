import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, Headers } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { Modulo } from '../auth/modulo.decorator';
import { tenantDeSesion, tenantParaListar, tenantParaEscribir } from '../auth/tenant-access.util';

@Controller('suppliers')
@Modulo('proveedores')
export class SuppliersController {
  constructor(private suppliersService: SuppliersService) {}

  @Get()
  findAll(
    @Query('tenantId') tenantId?: string,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
    @Headers('x-company-id') headerCompanyId?: string,
    @Req() req?: any,
  ) {
    // Auditoría de seguridad (GoodsHabits): query('tenantId') es controlable por el
    // cliente — antes se evaluaba ANTES que el JWT (GET /suppliers?tenantId=<otro> filtraba
    // proveedores de otro tenant). El JWT va primero; el query param queda como fallback.
    // Tenant del token; SOPORTE solo con ?tenantId= explícito; un token sin tenant que no es SOPORTE recibe 403.
    const tenantIdFromReq = tenantParaListar(req, tenantId);
    const userCompanyId = req?.user?.companyId;
    const companyId = userCompanyId || headerCompanyId;
    const isActiveBool = isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.suppliersService.findAll(tenantIdFromReq, search, isActiveBool, companyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req?: any) {
    return this.suppliersService.findOne(id, tenantDeSesion(req));
  }

  // Recomendación #4 (seguimiento auditoría BUSINESS): antes era un stub que siempre
  // devolvía [], con un comentario diciendo que se implementaría "cuando se cree el módulo
  // de compras" — ese módulo (src/purchases/) ya existe. Se conecta la consulta real.
  @Get(':id/purchases')
  getSupplierPurchases(@Param('id') id: string, @Req() req?: any) {
    return this.suppliersService.findPurchasesBySupplier(id, tenantDeSesion(req));
  }

  @Post()
  create(@Body() data: any, @Req() req?: any) {
    const tenantId = tenantParaEscribir(req, req?.query?.tenantId);
    return this.suppliersService.create({ ...data, tenantId });
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: any, @Req() req?: any) {
    return this.suppliersService.update(id, data, tenantDeSesion(req));
  }

  @Put(':id/deactivate')
  async deactivate(@Param('id') id: string, @Req() req?: any) {
    return this.suppliersService.softDelete(id, tenantDeSesion(req));
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Req() req?: any) {
    return this.suppliersService.delete(id, tenantDeSesion(req));
  }
}

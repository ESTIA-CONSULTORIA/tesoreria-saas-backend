import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { FacturacionService } from './facturacion.service';
import type { EmisorInput, ProductoFiscalInput, ReceptorInput } from './facturacion.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { validarRfc } from './fiscal-validators';

// Datos fiscales (F0 del CFDI 4.0). Sin timbrado: solo captura y validación local. El tenant SIEMPRE sale del token (nunca del
// body ni de la URL); un id de otro negocio responde 404. Solo ADMIN y GERENTE (los permisos finos de facturar se definen en F3, D-11).
const FISCAL = ['ADMIN', 'GERENTE'];

@UseGuards(RolesGuard)
@Roles(...FISCAL)
@Controller('facturacion')
export class FacturacionController {
  constructor(private service: FacturacionService) {}

  private tenant(req: any): string {
    const t = req?.user?.tenantId;
    if (!t) throw new ForbiddenException('Se requiere un negocio (tenant) en la sesión.');
    return t;
  }

  @Get('catalogos')
  catalogos() {
    return this.service.catalogos();
  }

  @Get('validar-rfc')
  validarRfc(@Query('rfc') rfc?: string) {
    const r = validarRfc(rfc);
    return r.ok ? { valido: true, rfc: r.rfc, tipo: r.tipo } : { valido: false, motivo: r.motivo };
  }

  @Get('emisor/:companyId')
  emisor(@Param('companyId') companyId: string, @Request() req: any) {
    return this.service.obtenerEmisor(this.tenant(req), companyId);
  }

  @Put('emisor/:companyId')
  guardarEmisor(@Param('companyId') companyId: string, @Body() body: EmisorInput, @Request() req: any) {
    return this.service.guardarEmisor(this.tenant(req), companyId, body ?? {});
  }

  @Get('sucursal/:branchId')
  sucursal(@Param('branchId') branchId: string, @Request() req: any) {
    return this.service.obtenerSucursal(this.tenant(req), branchId);
  }

  @Put('sucursal/:branchId')
  guardarSucursal(@Param('branchId') branchId: string, @Body() body: { codigoPostalExpedicion?: string }, @Request() req: any) {
    return this.service.guardarSucursal(this.tenant(req), branchId, body?.codigoPostalExpedicion);
  }

  @Get('producto/:productId')
  producto(@Param('productId') productId: string, @Request() req: any) {
    return this.service.obtenerProducto(this.tenant(req), productId);
  }

  @Put('producto/:productId')
  guardarProducto(@Param('productId') productId: string, @Body() body: ProductoFiscalInput, @Request() req: any) {
    return this.service.guardarProducto(this.tenant(req), productId, body ?? {});
  }

  @Get('receptores')
  receptores(@Request() req: any, @Query('rfc') rfc?: string) {
    return this.service.listarReceptores(this.tenant(req), rfc);
  }

  @Get('receptores/:id')
  receptor(@Param('id') id: string, @Request() req: any) {
    return this.service.obtenerReceptor(this.tenant(req), id);
  }

  @Post('receptores')
  crearReceptor(@Body() body: ReceptorInput, @Request() req: any) {
    return this.service.crearReceptor(this.tenant(req), body ?? {});
  }

  @Put('receptores/:id')
  actualizarReceptor(@Param('id') id: string, @Body() body: ReceptorInput, @Request() req: any) {
    return this.service.actualizarReceptor(this.tenant(req), id, body ?? {});
  }

  @Delete('receptores/:id')
  eliminarReceptor(@Param('id') id: string, @Request() req: any) {
    return this.service.eliminarReceptor(this.tenant(req), id);
  }
}

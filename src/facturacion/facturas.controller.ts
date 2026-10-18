import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { FacturasService } from './facturas.service';
import { CsdService } from './csd.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

// CFDI F1 — facturas desde caja, nota de crédito, cancelación y reportes (SIN validez fiscal: adaptador Mock) y custodia del CSD.
// El tenant SIEMPRE sale del token (SOPORTE, sin tenant, recibe 403); un id de otro negocio responde 404.
// Facturas: ADMIN y GERENTE (los permisos finos de facturar/cancelar se afinan en F3, D-11). CSD: SOLO ADMIN.
@UseGuards(RolesGuard)
@Roles('ADMIN', 'GERENTE')
@Controller('facturacion')
export class FacturasController {
  constructor(
    private facturas: FacturasService,
    private csd: CsdService,
  ) {}

  private tenant(req: any): string {
    const t = req?.user?.tenantId;
    if (!t) throw new ForbiddenException('Se requiere un negocio (tenant) en la sesión.');
    return t;
  }
  private actor(req: any) {
    return { email: req?.user?.email, id: req?.user?.id };
  }

  // ── facturas ──
  @Post('facturas/desde-venta/:ventaId')
  desdeVenta(@Param('ventaId') ventaId: string, @Body() body: { receptorId?: string; usoCfdi?: string }, @Request() req: any) {
    return this.facturas.crearDesdeVenta(this.tenant(req), ventaId, body ?? {}, this.actor(req));
  }

  @Get('facturas')
  listar(@Request() req: any, @Query('estado') estado?: string, @Query('tipo') tipo?: string, @Query('desde') desde?: string, @Query('hasta') hasta?: string, @Query('pagina') pagina?: string) {
    return this.facturas.listar(this.tenant(req), { estado, tipo, desde, hasta, pagina: pagina ? Number(pagina) : 1 });
  }

  // Antes de ':id' para que "reporte" no se tome como un id.
  @Get('facturas/reporte')
  reporte(@Request() req: any, @Query('desde') desde: string, @Query('hasta') hasta: string) {
    return this.facturas.reporte(this.tenant(req), desde, hasta);
  }

  @Get('facturas/:id')
  obtener(@Param('id') id: string, @Request() req: any) {
    return this.facturas.obtener(this.tenant(req), id);
  }

  @Post('facturas/:id/reintentar')
  reintentar(@Param('id') id: string, @Request() req: any) {
    return this.facturas.reintentar(this.tenant(req), id, this.actor(req));
  }

  @Post('facturas/:id/nota-credito')
  notaCredito(@Param('id') id: string, @Body() body: { partidas?: number[]; motivo?: string }, @Request() req: any) {
    return this.facturas.notaCredito(this.tenant(req), id, body ?? {}, this.actor(req));
  }

  @Post('facturas/:id/cancelar')
  cancelar(@Param('id') id: string, @Body() body: { motivo?: string; uuidSustituto?: string }, @Request() req: any) {
    return this.facturas.cancelar(this.tenant(req), id, body ?? {}, this.actor(req));
  }

  @Post('facturas/:id/estatus')
  estatus(@Param('id') id: string, @Request() req: any) {
    return this.facturas.refrescarEstatus(this.tenant(req), id, this.actor(req));
  }

  // ── CSD (solo ADMIN; jamás devuelve la llave ni la contraseña) ──
  @Roles('ADMIN')
  @Get('csd/:companyId')
  csdEstado(@Param('companyId') companyId: string, @Request() req: any) {
    return this.csd.obtenerEstado(this.tenant(req), companyId);
  }

  @Roles('ADMIN')
  @Put('csd/:companyId')
  csdCargar(@Param('companyId') companyId: string, @Body() body: { cerB64?: string; keyB64?: string; password?: string }, @Request() req: any) {
    return this.csd.cargar(this.tenant(req), companyId, body ?? {}, req?.user?.email ?? req?.user?.id ?? 'desconocido');
  }

  @Roles('ADMIN')
  @Delete('csd/:companyId')
  csdDesactivar(@Param('companyId') companyId: string, @Request() req: any) {
    return this.csd.desactivar(this.tenant(req), companyId);
  }
}

import { Body, Controller, ForbiddenException, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { MembresiasService } from './membresias.service';
import type { PlanInput, SocioInput } from './membresias.service';
import { Modulo } from '../auth/modulo.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

// Gimnasio: socios, planes, membresías, check-in, alertas y reportes. El tenant SIEMPRE sale del token (nunca del body ni de la
// URL): un id de otro negocio responde 404. El módulo `membresias` solo existe en tenants de giro gimnasio.
//
//  · Planes (crear/editar) y reportes: ADMIN y GERENTE.        · Cancelar una membresía: ADMIN y GERENTE.
//  · Socios, congelar, check-in, alertas: ADMIN, GERENTE y RECEPCION.
//  · Cobrar y renovar NO está aquí: es una venta normal del POS (POST /pos/sales con el producto del plan y socioId).
const ADMIN_GERENTE = ['ADMIN', 'GERENTE', 'SOPORTE'];
const OPERA = ['ADMIN', 'GERENTE', 'RECEPCION', 'SOPORTE'];

@Modulo('membresias')
@UseGuards(RolesGuard)
@Controller('membresias')
export class MembresiasController {
  constructor(private service: MembresiasService) {}

  private tenant(req: any): string {
    const t = req?.user?.tenantId;
    if (!t) throw new ForbiddenException('Se requiere un negocio (tenant) en la sesión.');
    return t;
  }

  // ── planes ──
  @Roles(...OPERA)
  @Get('planes')
  planes(@Request() req: any, @Query('activos') activos?: string) {
    return this.service.listarPlanes(this.tenant(req), activos === 'true');
  }

  @Roles(...ADMIN_GERENTE)
  @Post('planes')
  crearPlan(@Body() body: PlanInput, @Request() req: any) {
    return this.service.crearPlan(this.tenant(req), body ?? {});
  }

  @Roles(...ADMIN_GERENTE)
  @Put('planes/:id')
  actualizarPlan(@Param('id') id: string, @Body() body: PlanInput, @Request() req: any) {
    return this.service.actualizarPlan(id, this.tenant(req), body ?? {});
  }

  // ── socios ──
  @Roles(...OPERA)
  @Get('socios')
  socios(@Request() req: any, @Query('q') q?: string, @Query('estado') estado?: string, @Query('situacion') situacion?: string) {
    return this.service.listarSocios(this.tenant(req), { q, estado, situacion });
  }

  @Roles(...OPERA)
  @Post('socios')
  crearSocio(@Body() body: SocioInput, @Request() req: any) {
    return this.service.crearSocio(this.tenant(req), body ?? {}, req?.user?.branchId ?? null);
  }

  // Antes de ':id' para que "numero" no se tome como un id.
  @Roles(...OPERA)
  @Get('socios/numero/:numero')
  porNumero(@Param('numero') numero: string, @Request() req: any) {
    return this.service.buscarPorNumero(this.tenant(req), numero);
  }

  @Roles(...OPERA)
  @Get('socios/:id')
  socio(@Param('id') id: string, @Request() req: any) {
    return this.service.obtenerSocio(id, this.tenant(req));
  }

  @Roles(...OPERA)
  @Put('socios/:id')
  actualizarSocio(@Param('id') id: string, @Body() body: SocioInput, @Request() req: any) {
    return this.service.actualizarSocio(id, this.tenant(req), body ?? {});
  }

  // ── membresías ──
  @Roles(...OPERA)
  @Post(':id/congelar')
  congelar(@Param('id') id: string, @Request() req: any) {
    return this.service.congelar(id, this.tenant(req));
  }

  @Roles(...OPERA)
  @Post(':id/descongelar')
  descongelar(@Param('id') id: string, @Request() req: any) {
    return this.service.descongelar(id, this.tenant(req));
  }

  @Roles(...ADMIN_GERENTE)
  @Post(':id/cancelar')
  cancelar(@Param('id') id: string, @Body() body: { motivo?: string }, @Request() req: any) {
    return this.service.cancelar(id, this.tenant(req), body?.motivo ?? '', req?.user?.email);
  }

  // ── check-in ──
  @Roles(...OPERA)
  @Post('checkin')
  checkin(@Body() body: { numero?: string; nip?: string }, @Request() req: any) {
    return this.service.checkin(this.tenant(req), body ?? {}, { email: req?.user?.email, id: req?.user?.id ?? req?.user?.sub, branchId: req?.user?.branchId });
  }

  @Roles(...OPERA)
  @Get('checkins')
  checkins(@Request() req: any, @Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    return this.service.listarCheckins(this.tenant(req), desde, hasta);
  }

  // ── alertas y reportes ──
  @Roles(...OPERA)
  @Get('alertas')
  alertas(@Request() req: any) {
    return this.service.alertas(this.tenant(req));
  }

  @Roles(...ADMIN_GERENTE)
  @Get('reportes/membresias')
  reporte(@Request() req: any, @Query('estado') estado?: string) {
    const validos = ['vigentes', 'vencidas', 'por-vencer', 'congeladas', 'sin-membresia'];
    return this.service.reporteMembresias(this.tenant(req), validos.includes(estado ?? '') ? (estado as any) : undefined);
  }

  @Roles(...ADMIN_GERENTE)
  @Get('reportes/ingresos')
  ingresos(@Request() req: any, @Query('desde') desde: string, @Query('hasta') hasta: string, @Query('sucursalId') sucursalId?: string) {
    return this.service.ingresosPorConcepto(this.tenant(req), desde, hasta, sucursalId);
  }
}

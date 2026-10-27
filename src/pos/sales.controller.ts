import { Controller, Get, Post, Put, Delete, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { SalesService } from './sales.service';
import { OfflineVentasService } from './offline-ventas.service';
import { RolesGuard } from '../auth/roles.guard';
import { sucursalEfectiva, sucursalParaEscribir } from '../common/sucursal-efectiva';
import { Roles } from '../auth/roles.decorator';
import { registrarRechazo } from './log-rechazo';

@Controller('pos/sales')
export class SalesController {
  constructor(private salesService: SalesService, private offlineVentas: OfflineVentasService) {}

  @Post()
  createSale(@Body() data: any, @Request() req) {
    const tenantId = req.user?.tenantId || req.tenantId;
    // Sucursal de la venta: la del usuario (pedir otra es 403); sin sucursal en el token vale la enviada, validada en create().
    const sucursalId = sucursalParaEscribir(req.user, data?.sucursalId);
    return this.salesService.create({
      ...data,
      ...(sucursalId ? { sucursalId } : {}),
      tenantId,
    }, req.user ?? {}, { ip: req.ip, userAgent: req.headers?.['user-agent'] }).catch((e) => {
      registrarRechazo('POST /pos/sales', e, req, data);
      throw e;
    });
  }

  @Get()
  getSales(@Query() filters: any, @Request() req) {
    const tenantId = req.user?.tenantId || req.tenantId;
    // Historial: un usuario con sucursal solo ve las ventas de la suya, aunque mande otro sucursalId.
    const efectiva = sucursalEfectiva(req.user, filters?.sucursalId);
    return this.salesService.findAll({
      ...filters,
      ...(efectiva.branchId ? { sucursalId: efectiva.branchId } : {}),
      tenantId,
    });
  }

  // POS flexible, capacidad ligar_venta_a_cita: citas del día (o rango from/to) del tenant,
  // filtrables por nombre de paciente. Declarado ANTES de ':id' para que 'citas' no se
  // interprete como un id de venta.
  @Get('citas')
  getCitasParaLigar(@Query() filters: { from?: string; to?: string; paciente?: string }, @Request() req) {
    const tenantId = req.user?.tenantId || req.tenantId;
    return this.salesService.buscarCitasParaLigar(tenantId, filters);
  }

  // POS flexible, capacidad mesas_cuenta_abierta. Declarado ANTES de ':id' (igual que 'citas').
  @Get('cuentas-abiertas')
  getCuentasAbiertas(@Query() filters: { tableId?: string; sucursalId?: string }, @Request() req) {
    const tenantId = req.user?.tenantId || req.tenantId;
    const efectiva = sucursalEfectiva(req.user, filters?.sucursalId);
    return this.salesService.buscarCuentasAbiertas(tenantId, { ...filters, ...(efectiva.branchId ? { sucursalId: efectiva.branchId } : {}) });
  }

  // Política de devoluciones vigente y si quien llama puede devolver (para que el POS muestre u oculte
  // el botón). Es solo informativo: returnSale() vuelve a decidir. Antes de ':id'.
  @Get('politica-devoluciones')
  getPoliticaDevoluciones(@Request() req) {
    return this.salesService.getPoliticaDevolucionesParaUsuario(req.user?.tenantId, req.user);
  }

  // Políticas de cobro y división y qué puede hacer el usuario actual con las cuentas de mesa. Antes de ':id'.
  @Get('politicas-mesas')
  getPoliticasMesas(@Request() req) {
    return this.salesService.getPoliticasMesasParaUsuario(req.user?.tenantId, req.user);
  }

  // Ventas offline que el servidor rechazó al sincronizar (precio que subió): evaluar, registrar al precio vigente o descartar
  // con motivo. Solo ADMIN y GERENTE; el tenant sale del token, nunca del payload. Antes de ':id'.
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Post('offline-fallidas/evaluar')
  evaluarVentaOffline(@Body() body: { payload: any }, @Request() req) {
    return this.offlineVentas.evaluar(body?.payload, req.user?.tenantId);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Post('offline-fallidas/registrar')
  registrarVentaOffline(@Body() body: { payload: any; confirmarDiferencia?: boolean }, @Request() req) {
    return this.offlineVentas.registrar(body?.payload, { confirmarDiferencia: body?.confirmarDiferencia === true }, req.user?.tenantId, req.user ?? {}, { ip: req.ip, userAgent: req.headers?.['user-agent'] });
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Post('offline-fallidas/descartar')
  descartarVentaOffline(@Body() body: { folio: string; motivo: string; resumen?: any }, @Request() req) {
    return this.offlineVentas.descartar(body, req.user?.tenantId, req.user ?? {}, { ip: req.ip, userAgent: req.headers?.['user-agent'] });
  }

  @Get(':id')
  getSale(@Param('id') id: string, @Request() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.salesService.findOne(id, tenantId);
  }

  @Post(':id/items')
  addItems(@Param('id') id: string, @Body() data: any, @Request() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.salesService.agregarItems(id, data, tenantId);
  }

  @Delete(':id/items/:index')
  removeItem(@Param('id') id: string, @Param('index') index: string, @Request() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.salesService.quitarItem(id, Number(index), tenantId, req?.user ?? {});
  }

  @Post(':id/pagos')
  cobrarCuenta(@Param('id') id: string, @Body() data: any, @Request() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.salesService.cobrarCuenta(id, data, tenantId, req?.user ?? {}, { ip: req?.ip, userAgent: req?.headers?.['user-agent'] }).catch((e) => {
      registrarRechazo('POST /pos/sales/:id/pagos', e, req, data);
      throw e;
    });
  }

  @Put(':id/pay')
  paySale(@Param('id') id: string, @Body() data: any, @Request() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.salesService.pay(id, data, tenantId, req?.user ?? {}, { ip: req?.ip, userAgent: req?.headers?.['user-agent'] }).catch((e) => {
      registrarRechazo('PUT /pos/sales/:id/pay', e, req, data);
      throw e;
    });
  }

  @Put(':id/cancel')
  cancelSale(@Param('id') id: string, @Body() data: { motivo: string }, @Request() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.salesService.cancel(id, data.motivo, tenantId, req?.user ?? {});
  }

  @Put(':id/discount')
  applyDiscount(
    @Param('id') id: string,
    @Body() data: { descuento: number; nuevoTotal: number; autorizacion?: { token?: string } },
    @Request() req?: any,
  ) {
    const tenantId = req?.user?.tenantId;
    return this.salesService.applyDiscount(id, data.descuento, data.nuevoTotal, tenantId, req?.user ?? {}, data.autorizacion, { ip: req?.ip, userAgent: req?.headers?.['user-agent'] });
  }

  // El servicio decide según la política del tenant (SOLO_GERENTE | CAJERO_LIBRE) y el rol de quien llama.
  @Post(':id/return')
  returnSale(@Param('id') id: string, @Body() data: any, @Request() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.salesService.returnSale(id, data, tenantId, req?.user);
  }
}

import { tenantDeSesion } from '../auth/tenant-access.util';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, Headers, Request, UseGuards } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { Modulo } from '../auth/modulo.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { sucursalEfectiva } from '../common/sucursal-efectiva';

@Controller('purchases')
@Modulo('compras')
export class PurchasesController {
  constructor(private purchasesService: PurchasesService) {}

  // Purchase Orders
  @Get('orders')
  findAllOrders(
    @Query('tenantId') tenantId?: string,
    @Query('status') status?: string,
    @Headers('x-branch-id') headerBranchId?: string,
    @Headers('x-company-id') headerCompanyId?: string,
    @Request() req?: any,
  ) {
    const userBranchId = req?.user?.branchId;
    const userCompanyId = req?.user?.companyId;

    const branchId = sucursalEfectiva(req?.user, headerBranchId).branchId;
    const companyId = headerCompanyId || userCompanyId;

    // El tenant sale del token; el query solo vale para SOPORTE (sin tenant en su token). Antes cualquiera podía pedir otro.
    return this.purchasesService.findAllOrders(req?.user?.tenantId || tenantId, status, branchId, companyId);
  }

  @Get('orders/:id')
  findOneOrder(@Param('id') id: string, @Request() req?: any) {
    return this.purchasesService.findOneOrder(id, tenantDeSesion(req));
  }

  @Post('orders')
  createOrder(@Body() data: any, @Request() req?: any) {
    const tenantId = req?.user?.tenantId;
    const branchId = req?.user?.branchId;
    return this.purchasesService.createOrder({ ...data, tenantId, branchId });
  }

  @Put('orders/:id')
  updateOrder(@Param('id') id: string, @Body() data: any, @Request() req?: any) {
    return this.purchasesService.updateOrder(id, data, tenantDeSesion(req));
  }

  @Put('orders/:id/send')
  async markOrderAsSent(@Param('id') id: string, @Request() req?: any) {
    return this.purchasesService.markOrderAsSent(id, tenantDeSesion(req));
  }

  @Put('orders/:id/cancel')
  async cancelOrder(@Param('id') id: string, @Request() req?: any) {
    return this.purchasesService.cancelOrder(id, tenantDeSesion(req));
  }

  @Post('orders/:id/request-cancellation')
  async requestCancellation(@Param('id') id: string, @Body() data: { motivo: string, userId: string }, @Request() req?: any) {
    return this.purchasesService.requestCancellation(id, data.motivo, data.userId, tenantDeSesion(req));
  }

  // Auditoría de seguridad (GoodsHabits, verificación PurchasesPage/useAuthStore, Hallazgo
  // 1): no tenía ningún guard de rol — cualquier usuario autenticado del tenant con módulo
  // 'compras' activo podía aprobar una cancelación directo por API, aunque el frontend
  // (PurchasesPage.tsx) solo muestra el botón "Aprobar" a ADMIN/SOPORTE. Confirmado con
  // curl real contra producción antes de este cambio: una cuenta GERENTE aprobaba sin
  // problema. Mismo patrón que el resto de los guards de esta auditoría.
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SOPORTE')
  @Post('orders/:id/approve-cancellation')
  async approveCancellation(@Param('id') id: string, @Body() data: { userId: string }, @Request() req?: any) {
    return this.purchasesService.approveCancellation(id, data.userId, tenantDeSesion(req));
  }

  @Put('orders/:id/receive')
  async receiveOrder(@Param('id') id: string, @Body() data: { receivedItems: any[] }, @Request() req?: any) {
    return this.purchasesService.receiveOrder(id, data.receivedItems, tenantDeSesion(req));
  }

  @Delete('orders/:id')
  deleteOrder(@Param('id') id: string, @Request() req?: any) {
    return this.purchasesService.deleteOrder(id, tenantDeSesion(req));
  }

  // Purchases (Facturas)
  @Get('invoices')
  findAllPurchases(
    @Query('tenantId') tenantId?: string,
    @Query('status') status?: string,
    @Headers('x-company-id') headerCompanyId?: string,
    @Request() req?: any,
  ) {
    const companyId = headerCompanyId || req?.user?.companyId;

    // El tenant sale del token; el query solo vale para SOPORTE. Antes, sin ?tenantId= devolvía las facturas de TODOS.
    return this.purchasesService.findAllPurchases(tenantDeSesion(req) ?? tenantId, status, companyId);
  }

  @Get('invoices/:id')
  findOnePurchase(@Param('id') id: string, @Request() req?: any) {
    return this.purchasesService.findOnePurchase(id, tenantDeSesion(req));
  }

  @Post('invoices')
  createPurchase(@Body() data: any, @Request() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.purchasesService.createPurchase({ ...data, tenantId });
  }

  @Put('invoices/:id')
  updatePurchase(@Param('id') id: string, @Body() data: any, @Request() req?: any) {
    return this.purchasesService.updatePurchase(id, data, tenantDeSesion(req));
  }

  @Post('invoices/:id/register-payment')
  async registerPayment(
    @Param('id') id: string,
    @Body() data: {
      amount: number;
      accountId: string;
      fechaPago: string;
      referencia?: string;
      notas?: string;
      userId: string;
    },
    @Request() req?: any,
  ) {
    return this.purchasesService.registerPayment(id, data, tenantDeSesion(req));
  }

  @Delete('invoices/:id')
  deletePurchase(@Param('id') id: string, @Request() req?: any) {
    return this.purchasesService.deletePurchase(id, tenantDeSesion(req));
  }

  // Cuentas por Pagar
  @Get('accounts-payable')
  async getAccountsPayable(
    @Query('tenantId') tenantId?: string,
    @Headers('x-company-id') headerCompanyId?: string,
    @Request() req?: any,
  ) {
    const companyId = headerCompanyId || req?.user?.companyId;

    return this.purchasesService.getAccountsPayable(tenantDeSesion(req) ?? tenantId, companyId);
  }
}

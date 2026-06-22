import { Controller, Get, Post, Put, Delete, Body, Param, Query, Headers, Request } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { Modulo } from '../auth/modulo.decorator';

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

    const branchId = headerBranchId || userBranchId;
    const companyId = headerCompanyId || userCompanyId;

    return this.purchasesService.findAllOrders(tenantId, status, branchId, companyId);
  }

  @Get('orders/:id')
  findOneOrder(@Param('id') id: string) {
    return this.purchasesService.findOneOrder(id);
  }

  @Post('orders')
  createOrder(@Body() data: any, @Request() req?: any) {
    const tenantId = req?.user?.tenantId;
    const branchId = req?.user?.branchId;
    return this.purchasesService.createOrder({ ...data, tenantId, branchId });
  }

  @Put('orders/:id')
  updateOrder(@Param('id') id: string, @Body() data: any) {
    return this.purchasesService.updateOrder(id, data);
  }

  @Put('orders/:id/send')
  async markOrderAsSent(@Param('id') id: string) {
    return this.purchasesService.markOrderAsSent(id);
  }

  @Put('orders/:id/cancel')
  async cancelOrder(@Param('id') id: string) {
    return this.purchasesService.cancelOrder(id);
  }

  @Post('orders/:id/request-cancellation')
  async requestCancellation(@Param('id') id: string, @Body() data: { motivo: string, userId: string }) {
    return this.purchasesService.requestCancellation(id, data.motivo, data.userId);
  }

  @Post('orders/:id/approve-cancellation')
  async approveCancellation(@Param('id') id: string, @Body() data: { userId: string }) {
    return this.purchasesService.approveCancellation(id, data.userId);
  }

  @Put('orders/:id/receive')
  async receiveOrder(@Param('id') id: string, @Body() data: { receivedItems: any[] }) {
    return this.purchasesService.receiveOrder(id, data.receivedItems);
  }

  @Delete('orders/:id')
  deleteOrder(@Param('id') id: string) {
    return this.purchasesService.deleteOrder(id);
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

    return this.purchasesService.findAllPurchases(tenantId, status, companyId);
  }

  @Get('invoices/:id')
  findOnePurchase(@Param('id') id: string) {
    return this.purchasesService.findOnePurchase(id);
  }

  @Post('invoices')
  createPurchase(@Body() data: any, @Request() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.purchasesService.createPurchase({ ...data, tenantId });
  }

  @Put('invoices/:id')
  updatePurchase(@Param('id') id: string, @Body() data: any) {
    return this.purchasesService.updatePurchase(id, data);
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
  ) {
    return this.purchasesService.registerPayment(id, data);
  }

  @Delete('invoices/:id')
  deletePurchase(@Param('id') id: string) {
    return this.purchasesService.deletePurchase(id);
  }

  // Cuentas por Pagar
  @Get('accounts-payable')
  async getAccountsPayable(
    @Query('tenantId') tenantId?: string,
    @Headers('x-company-id') headerCompanyId?: string,
    @Request() req?: any,
  ) {
    const companyId = headerCompanyId || req?.user?.companyId;

    return this.purchasesService.getAccountsPayable(tenantId, companyId);
  }
}

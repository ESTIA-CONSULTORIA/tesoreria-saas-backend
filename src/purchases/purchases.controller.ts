import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { Modulo } from '../auth/modulo.decorator';

@Controller('purchases')
@Modulo('compras')
export class PurchasesController {
  constructor(private purchasesService: PurchasesService) {}

  // Purchase Orders
  @Get('orders')
  findAllOrders(@Param('tenantId') tenantId?: string) {
    return this.purchasesService.findAllOrders(tenantId);
  }

  @Get('orders/:id')
  findOneOrder(@Param('id') id: string) {
    return this.purchasesService.findOneOrder(id);
  }

  @Post('orders')
  createOrder(@Body() data: any) {
    return this.purchasesService.createOrder(data);
  }

  @Put('orders/:id')
  updateOrder(@Param('id') id: string, @Body() data: any) {
    return this.purchasesService.updateOrder(id, data);
  }

  @Delete('orders/:id')
  deleteOrder(@Param('id') id: string) {
    return this.purchasesService.deleteOrder(id);
  }

  // Purchases (Facturas)
  @Get('invoices')
  findAllPurchases(@Param('tenantId') tenantId?: string) {
    return this.purchasesService.findAllPurchases(tenantId);
  }

  @Get('invoices/:id')
  findOnePurchase(@Param('id') id: string) {
    return this.purchasesService.findOnePurchase(id);
  }

  @Post('invoices')
  createPurchase(@Body() data: any) {
    return this.purchasesService.createPurchase(data);
  }

  @Put('invoices/:id')
  updatePurchase(@Param('id') id: string, @Body() data: any) {
    return this.purchasesService.updatePurchase(id, data);
  }

  @Delete('invoices/:id')
  deletePurchase(@Param('id') id: string) {
    return this.purchasesService.deletePurchase(id);
  }
}

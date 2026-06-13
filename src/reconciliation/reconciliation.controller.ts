import { Controller, Get, Post, Put, Delete, Body, Param, Query, Request } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';
import { Invoice, InvoiceType, InvoiceStatus, ReconciliationStatus } from './entities/invoice.entity';

@Controller('reconciliation')
export class ReconciliationController {
  constructor(private reconciliationService: ReconciliationService) {}

  @Get()
  getAllInvoices(@Request() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.reconciliationService.getAllInvoices(tenantId);
  }

  @Get('summary')
  getSummary(@Request() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.reconciliationService.getReconciliationSummary(tenantId);
  }

  @Get('status/:status')
  getInvoicesByStatus(@Param('status') status: ReconciliationStatus, @Request() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.reconciliationService.getInvoicesByStatus(status, tenantId);
  }

  @Get('data')
  getReconciliationData(
    @Query('bankAccountId') bankAccountId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('type') type?: InvoiceType,
    @Request() req?: any,
  ) {
    const tenantId = req?.user?.tenantId;
    return this.reconciliationService.getReconciliationData({
      bankAccountId,
      startDate,
      endDate,
      type,
      tenantId,
    });
  }

  @Get('movements')
  getAvailableMovements(@Query('bankAccountId') bankAccountId?: string) {
    return this.reconciliationService.getAvailableMovements(bankAccountId);
  }

  @Post()
  createInvoice(
    @Body() data: {
      invoiceNumber: string;
      type: InvoiceType;
      status: InvoiceStatus;
      amount: number;
      dueDate: Date;
      accountId?: string;
      bankAccountId?: string;
      concept?: string;
    },
    @Request() req?: any,
  ) {
    const tenantId = req?.user?.tenantId;
    return this.reconciliationService.createInvoice({ ...data, tenantId });
  }

  @Delete(':id')
  deleteInvoice(@Param('id') id: string) {
    return this.reconciliationService.deleteInvoice(id);
  }

  @Put(':id/status')
  updateInvoiceStatus(
    @Param('id') id: string,
    @Body('status') status: ReconciliationStatus,
  ) {
    return this.reconciliationService.updateInvoiceStatus(id, status);
  }

  @Put(':id/manual-review')
  markForManualReview(@Param('id') id: string) {
    return this.reconciliationService.markForManualReview(id);
  }

  @Post(':invoiceId/reconcile')
  manualReconciliation(
    @Param('invoiceId') invoiceId: string,
    @Body('movementId') movementId: string,
  ) {
    return this.reconciliationService.manualReconciliation(invoiceId, movementId);
  }

  @Post('import')
  importInvoices(@Body() data: { invoices: any[] }, @Request() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.reconciliationService.importInvoices(data.invoices, tenantId);
  }
}

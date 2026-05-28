import { Controller, Get, Post, Put, Body, Param } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';
import { Invoice, InvoiceType, InvoiceStatus, ReconciliationStatus } from './entities/invoice.entity';

@Controller('reconciliation')
export class ReconciliationController {
  constructor(private reconciliationService: ReconciliationService) {}

  @Get()
  getAllInvoices() {
    return this.reconciliationService.getAllInvoices();
  }

  @Get('summary')
  getSummary() {
    return this.reconciliationService.getReconciliationSummary();
  }

  @Get('status/:status')
  getInvoicesByStatus(@Param('status') status: ReconciliationStatus) {
    return this.reconciliationService.getInvoicesByStatus(status);
  }

  @Post()
  createInvoice(@Body() data: {
    invoiceNumber: string;
    type: InvoiceType;
    status: InvoiceStatus;
    amount: number;
    dueDate: Date;
    accountId?: string;
    bankAccountId?: string;
    concept?: string;
  }) {
    return this.reconciliationService.createInvoice(data);
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
}

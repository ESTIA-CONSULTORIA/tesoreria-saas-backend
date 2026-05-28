import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice, InvoiceStatus, ReconciliationStatus, InvoiceType } from './entities/invoice.entity';

@Injectable()
export class ReconciliationService {
  constructor(
    @InjectRepository(Invoice)
    private invoicesRepo: Repository<Invoice>,
  ) {}

  async getAllInvoices() {
    return this.invoicesRepo.find({ order: { createdAt: 'DESC' } });
  }

  async getInvoicesByStatus(status: ReconciliationStatus) {
    return this.invoicesRepo.find({
      where: { reconciliationStatus: status },
      order: { createdAt: 'DESC' },
    });
  }

  async createInvoice(data: {
    invoiceNumber: string;
    type: InvoiceType;
    status: InvoiceStatus;
    amount: number;
    dueDate: Date;
    accountId?: string;
    bankAccountId?: string;
    concept?: string;
  }) {
    const invoice = this.invoicesRepo.create({
      ...data,
      reconciliationStatus: ReconciliationStatus.PENDIENTE,
      needsManualReview: false,
    });
    return this.invoicesRepo.save(invoice);
  }

  async updateInvoiceStatus(id: string, status: ReconciliationStatus) {
    await this.invoicesRepo.update(id, { reconciliationStatus: status });
    return this.invoicesRepo.findOne({ where: { id } });
  }

  async markForManualReview(id: string) {
    await this.invoicesRepo.update(id, { needsManualReview: true });
    return this.invoicesRepo.findOne({ where: { id } });
  }

  async getReconciliationSummary() {
    const all = await this.invoicesRepo.find();
    return {
      total: all.length,
      conciliadas: all.filter((i) => i.reconciliationStatus === ReconciliationStatus.CONCILIADA).length,
      pendientes: all.filter((i) => i.reconciliationStatus === ReconciliationStatus.PENDIENTE).length,
      noConciliadas: all.filter((i) => i.reconciliationStatus === ReconciliationStatus.NO_CONCILIADA).length,
      emitidas: all.filter((i) => i.type === InvoiceType.EMITIDA).length,
      recibidas: all.filter((i) => i.type === InvoiceType.RECIBIDA).length,
    };
  }
}

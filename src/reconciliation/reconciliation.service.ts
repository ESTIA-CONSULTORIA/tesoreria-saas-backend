import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice, InvoiceStatus, ReconciliationStatus, InvoiceType } from './entities/invoice.entity';
import { Movement } from '../movements/entities/movement.entity';
import { Bank } from '../banks/entities/bank.entity';

@Injectable()
export class ReconciliationService {
  constructor(
    @InjectRepository(Invoice)
    private invoicesRepo: Repository<Invoice>,
    @InjectRepository(Movement)
    private movementsRepo: Repository<Movement>,
    @InjectRepository(Bank)
    private banksRepo: Repository<Bank>,
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

  async getReconciliationData(filters?: {
    bankAccountId?: string;
    startDate?: string;
    endDate?: string;
    type?: InvoiceType;
  }) {
    // Obtener movimientos bancarios
    const movementsQuery = this.movementsRepo.createQueryBuilder('movement');
    if (filters?.bankAccountId) {
      movementsQuery.andWhere('movement.accountId = :accountId', { accountId: filters.bankAccountId });
    }
    if (filters?.startDate) {
      movementsQuery.andWhere('movement.createdAt >= :startDate', { startDate: filters.startDate });
    }
    if (filters?.endDate) {
      movementsQuery.andWhere('movement.createdAt <= :endDate', { endDate: `${filters.endDate} 23:59:59` });
    }
    const movements = await movementsQuery.getMany();

    // Obtener facturas
    const invoicesQuery = this.invoicesRepo.createQueryBuilder('invoice');
    if (filters?.bankAccountId) {
      invoicesQuery.andWhere('invoice.bankAccountId = :bankAccountId', { bankAccountId: filters.bankAccountId });
    }
    if (filters?.type) {
      invoicesQuery.andWhere('invoice.type = :type', { type: filters.type });
    }
    if (filters?.startDate) {
      invoicesQuery.andWhere('invoice.dueDate >= :startDate', { startDate: filters.startDate });
    }
    if (filters?.endDate) {
      invoicesQuery.andWhere('invoice.dueDate <= :endDate', { endDate: filters.endDate });
    }
    const invoices = await invoicesQuery.getMany();

    // Cruzar datos
    const reconciled = invoices.filter((invoice) => invoice.movementId && invoice.reconciliationStatus === ReconciliationStatus.CONCILIADA);
    const pending = invoices.filter((invoice) => !invoice.movementId && invoice.reconciliationStatus === ReconciliationStatus.PENDIENTE);
    const notReconciled = movements.filter((movement) => !invoices.find((invoice) => invoice.movementId === movement.id));

    // Obtener nombres de cuentas
    const banks = await this.banksRepo.find();
    const getBankName = (accountId: string) => banks.find((b) => b.id === accountId)?.name || accountId;

    return {
      reconciled: await Promise.all(
        reconciled.map(async (invoice) => {
          const movement = await this.movementsRepo.findOne({ where: { id: invoice.movementId } });
          return {
            invoice: {
              ...invoice,
              bankName: invoice.bankAccountId ? getBankName(invoice.bankAccountId) : null,
            },
            movement,
          };
        }),
      ),
      pending: pending.map((invoice) => ({
        ...invoice,
        bankName: invoice.bankAccountId ? getBankName(invoice.bankAccountId) : null,
      })),
      notReconciled: notReconciled.map((movement) => ({
        ...movement,
        bankName: getBankName(movement.accountId),
      })),
    };
  }

  async manualReconciliation(invoiceId: string, movementId: string) {
    await this.invoicesRepo.update(invoiceId, {
      movementId,
      reconciliationStatus: ReconciliationStatus.CONCILIADA,
    });
    return this.invoicesRepo.findOne({ where: { id: invoiceId } });
  }

  async getAvailableMovements(bankAccountId?: string) {
    const query = this.movementsRepo.createQueryBuilder('movement');
    if (bankAccountId) {
      query.andWhere('movement.accountId = :accountId', { accountId: bankAccountId });
    }
    return query.orderBy('movement.createdAt', 'DESC').getMany();
  }

  async importInvoices(invoices: any[]) {
    try {
      const results: Invoice[] = [];
      for (const invoiceData of invoices) {
        const invoice = this.invoicesRepo.create({
          invoiceNumber: invoiceData.invoiceNumber,
          type: invoiceData.type as InvoiceType,
          status: invoiceData.status as InvoiceStatus,
          amount: Number(invoiceData.amount),
          dueDate: new Date(invoiceData.dueDate),
          bankAccountId: invoiceData.bankAccountId,
          concept: invoiceData.concept,
          reconciliationStatus: ReconciliationStatus.PENDIENTE,
          needsManualReview: false,
        });
        const saved = await this.invoicesRepo.save(invoice);
        results.push(saved);
      }
      return { imported: results.length, invoices: results };
    } catch (error) {
      throw new Error(`Error al importar facturas: ${error.message}`);
    }
  }
}

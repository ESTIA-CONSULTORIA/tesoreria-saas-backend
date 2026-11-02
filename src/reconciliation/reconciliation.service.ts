import { BadRequestException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Invoice, InvoiceStatus, ReconciliationStatus, InvoiceType } from './entities/invoice.entity';
import { Movement } from '../movements/entities/movement.entity';
import { Bank } from '../banks/entities/bank.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Company } from '../companies/entities/company.entity';

@Injectable()
export class ReconciliationService {
  constructor(
    @InjectRepository(Invoice)
    private invoicesRepo: Repository<Invoice>,
    @InjectRepository(Movement)
    private movementsRepo: Repository<Movement>,
    @InjectRepository(Bank)
    private banksRepo: Repository<Bank>,
    @InjectRepository(Branch)
    private branchesRepo: Repository<Branch>,
    @InjectRepository(Company)
    private companiesRepo: Repository<Company>,
  ) {}

  // Cuentas (banks) del tenant: Bank -> Branch -> Company -> Tenant. Sin tenant -> []. (bank.tenantId es nullable en datos viejos.)
  private async cuentasDelTenant(tenantId?: string): Promise<string[]> {
    if (!tenantId) return [];
    const rows = await this.banksRepo
      .createQueryBuilder('bank')
      .select('bank.id', 'id')
      .innerJoin(Branch, 'branch', 'branch.id::text = bank."branchId"::text')
      .innerJoin(Company, 'company', 'company.id::text = branch."companyId"::text')
      .where('company."tenantId"::text = :tenantId', { tenantId })
      .getRawMany();
    return rows.map((r) => r.id);
  }

  async getAllInvoices(tenantId?: string) {
    if (!tenantId) return []; // sin tenant (SOPORTE sin ?tenantId=) nunca se listan todos
    const where: any = { tenantId };
    return this.invoicesRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async getInvoicesByStatus(status: ReconciliationStatus, tenantId?: string) {
    if (!tenantId) return [];
    const where: any = { reconciliationStatus: status, tenantId };
    return this.invoicesRepo.find({ where, order: { createdAt: 'DESC' } });
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
    tenantId?: string;
  }) {
    const tenantId = data.tenantId;
    if (!tenantId) throw new BadRequestException('Falta el negocio de la factura');
    delete (data as any).id; // con id en el body save() pisaría la factura de otro tenant
    await this.validarCuentas(tenantId, [data.accountId, data.bankAccountId]);
    const invoice = this.invoicesRepo.create({
      ...data,
      reconciliationStatus: ReconciliationStatus.PENDIENTE,
      needsManualReview: false,
    });
    return this.invoicesRepo.save(invoice);
  }

  // Auditoría BUSINESS (hallazgo transversal #6): Invoice sí tiene tenantId propio (a
  // diferencia de Movement) — mismo mensaje que "no encontrada" a propósito para no revelar
  // si el id existe en otro tenant. Opcional para no romper a SOPORTE.
  // La cuenta bancaria que llega en el body debe ser del tenant
  private async validarCuentas(tenantId: string, cuentas: Array<string | undefined>) {
    const pedidas = cuentas.filter(Boolean) as string[];
    if (!pedidas.length) return;
    const propias = await this.cuentasDelTenant(tenantId);
    if (pedidas.some((c) => !propias.includes(c))) throw new NotFoundException('Cuenta no encontrada');
  }

  private async assertOwnedInvoice(id: string, tenantId?: string): Promise<Invoice> {
    const invoice = await this.invoicesRepo.findOne({ where: { id } });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    if (tenantId && invoice.tenantId !== tenantId) {
      throw new NotFoundException('Factura no encontrada');
    }
    return invoice;
  }

  async updateInvoiceStatus(id: string, status: ReconciliationStatus, tenantId?: string) {
    if (!Object.values(ReconciliationStatus).includes(status)) throw new BadRequestException('Estado de conciliación inválido');
    await this.assertOwnedInvoice(id, tenantId);
    await this.invoicesRepo.update(id, { reconciliationStatus: status });
    return this.invoicesRepo.findOne({ where: { id } });
  }

  async markForManualReview(id: string, tenantId?: string) {
    await this.assertOwnedInvoice(id, tenantId);
    await this.invoicesRepo.update(id, { needsManualReview: true });
    return this.invoicesRepo.findOne({ where: { id } });
  }

  async getReconciliationSummary(tenantId?: string) {
    const where: any = { tenantId: tenantId ?? '__sin_tenant__' }; // sin tenant: cero filas, nunca todos
    if (!tenantId) return { total: 0, conciliadas: 0, pendientes: 0, noConciliadas: 0, emitidas: 0, recibidas: 0 };
    const all = await this.invoicesRepo.find({ where });
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
    tenantId?: string;
  }) {
    // Obtener movimientos bancarios
    const vacio = { reconciled: [], pending: [], notReconciled: [] };
    if (!filters?.tenantId) return vacio; // sin tenant nunca se concilia contra todos los movimientos
    const tenantAccountIds = await this.cuentasDelTenant(filters.tenantId);
    if (!tenantAccountIds.length) return vacio;
    if (filters.bankAccountId && !tenantAccountIds.includes(filters.bankAccountId)) return vacio;
    const movementsQuery = this.movementsRepo.createQueryBuilder('movement');
    movementsQuery.andWhere('movement.accountId IN (:...tenantAccountIds)', { tenantAccountIds });
    if (filters?.bankAccountId) {
      movementsQuery.andWhere('movement.accountId = :accountId', { accountId: filters.bankAccountId });
    }
    if (filters?.startDate) {
      movementsQuery.andWhere('movement.date >= :startDate', { startDate: filters.startDate });
    }
    if (filters?.endDate) {
      movementsQuery.andWhere('movement.date <= :endDate', { endDate: `${filters.endDate} 23:59:59` });
    }
    const movements = await movementsQuery.getMany();

    // Obtener facturas
    const invoicesQuery = this.invoicesRepo.createQueryBuilder('invoice');
    invoicesQuery.andWhere('invoice.tenantId = :tenantId', { tenantId: filters.tenantId });
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
    const banks = await this.banksRepo.find({ where: { id: In(tenantAccountIds) } }); // nombres solo de cuentas del tenant
    const getBankName = (accountId: string) => banks.find((b) => b.id === accountId)?.name || accountId;

    return {
      reconciled: await Promise.all(
        reconciled.map(async (invoice) => {
          const found = await this.movementsRepo.findOne({ where: { id: invoice.movementId } });
          const movement = found && tenantAccountIds.includes(found.accountId) ? found : null; // nunca un movimiento de otro tenant
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

  async deleteInvoice(id: string, tenantId?: string) {
    await this.assertOwnedInvoice(id, tenantId);
    await this.invoicesRepo.delete(id);
    return { deleted: true };
  }

  // Auditoría BUSINESS (hallazgo transversal #6): antes enlazaba cualquier invoiceId con
  // cualquier movementId sin verificar tenant en ninguno de los dos — se valida que la
  // factura sea del tenant que concilia, y que el movimiento pertenezca a una cuenta
  // bancaria de ese mismo tenant (Movement no tiene tenantId propio, se resuelve vía
  // Bank.tenantId, mismo patrón que movements.service.ts).
  async manualReconciliation(invoiceId: string, movementId: string, tenantId?: string) {
    await this.assertOwnedInvoice(invoiceId, tenantId);

    if (tenantId) {
      const movement = await this.movementsRepo.findOne({ where: { id: movementId } });
      if (!movement) throw new NotFoundException('Movimiento no encontrado');
      // la cuenta del movimiento debe ser del tenant por la cadena banco -> sucursal -> empresa -> tenant
      if (!(await this.cuentasDelTenant(tenantId)).includes(movement.accountId)) throw new NotFoundException('Movimiento no encontrado');
    }

    await this.invoicesRepo.update(invoiceId, {
      movementId,
      reconciliationStatus: ReconciliationStatus.CONCILIADA,
    });
    return this.invoicesRepo.findOne({ where: { id: invoiceId } });
  }

  // Auditoría BUSINESS (hallazgo transversal #6): mismo hueco que
  // movements.service.ts::findByAccount() antes de su fix — no verificaba que bankAccountId
  // fuera una cuenta del tenant que consulta.
  async getAvailableMovements(bankAccountId?: string, tenantId?: string) {
    if (!tenantId) return [];
    // Antes, sin bankAccountId la consulta no tenía ningún filtro de tenant: devolvía los movimientos de TODOS los tenants.
    const tenantAccountIds = await this.cuentasDelTenant(tenantId);
    if (bankAccountId && !tenantAccountIds.includes(bankAccountId)) throw new NotFoundException('Cuenta no encontrada');
    if (!tenantAccountIds.length) return [];
    const query = this.movementsRepo.createQueryBuilder('movement');
    query.andWhere('movement.accountId IN (:...tenantAccountIds)', { tenantAccountIds });
    if (bankAccountId) {
      query.andWhere('movement.accountId = :accountId', { accountId: bankAccountId });
    }
    return query.orderBy('movement.createdAt', 'DESC').getMany();
  }

  async importInvoices(invoices: any[], tenantId?: string) {
    if (!tenantId) throw new BadRequestException('Falta el negocio de las facturas');
    await this.validarCuentas(tenantId, (invoices || []).map((i) => i?.bankAccountId));
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
          tenantId,
          reconciliationStatus: ReconciliationStatus.PENDIENTE,
          needsManualReview: false,
        });
        const saved = await this.invoicesRepo.save(invoice);
        results.push(saved);
      }
      return { imported: results.length, invoices: results };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new Error(`Error al importar facturas: ${error.message}`);
    }
  }
}

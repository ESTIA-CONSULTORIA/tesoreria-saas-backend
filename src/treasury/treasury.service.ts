import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Bank } from '../banks/entities/bank.entity';
import { Movement } from '../movements/entities/movement.entity';
import { PaymentSchedule } from './entities/payment-schedule.entity';
import { Purchase } from '../purchases/entities/purchase.entity';
import { Company } from '../companies/entities/company.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Shift } from '../pos/entities/shift.entity';
import { Transfer } from '../transfers/entities/transfer.entity';

@Injectable()
export class TreasuryService {
  constructor(
    @InjectRepository(Bank)
    private banksRepo: Repository<Bank>,
    @InjectRepository(Movement)
    private movementsRepo: Repository<Movement>,
    @InjectRepository(PaymentSchedule)
    private paymentScheduleRepo: Repository<PaymentSchedule>,
    @InjectRepository(Purchase)
    private purchasesRepo: Repository<Purchase>,
    @InjectRepository(Shift)
    private shiftsRepo: Repository<Shift>,
    @InjectRepository(Transfer)
    private transfersRepo: Repository<Transfer>,
  ) {}

  private async getAccountIdsByTenant(tenantId?: string): Promise<string[]> {
    if (!tenantId) return [];
    
    // Bank -> Branch -> Company -> Tenant
    const companies = await this.banksRepo.manager.getRepository(Company).find({
      where: { tenantId },
      select: ['id'],
    });
    const companyIds = companies.map((c) => c.id);
    
    if (companyIds.length === 0) return [];
    
    const branches = await this.banksRepo.manager.getRepository(Branch).find({
      where: { companyId: In(companyIds) },
      select: ['id'],
    });
    const branchIds = branches.map((b) => b.id);
    
    if (branchIds.length === 0) return [];
    
    const banks = await this.banksRepo.find({
      where: { branchId: In(branchIds) },
      select: ['id'],
    });
    return banks.map((b) => b.id);
  }

  async getExecutiveSummary(tenantId?: string, branchId?: string, companyId?: string) {
    try {
      let accountIds: string[];
      
      if (branchId) {
        const banks = await this.banksRepo.find({
          where: { branchId },
          select: ['id'],
        });
        accountIds = banks.map((b) => b.id);
      } else if (companyId) {
        const branches = await this.banksRepo.manager.getRepository(Branch).find({
          where: { companyId },
          select: ['id'],
        });
        const branchIds = branches.map((b) => b.id);
        
        if (branchIds.length === 0) {
          accountIds = [];
        } else {
          const banks = await this.banksRepo.find({
            where: { branchId: In(branchIds) },
            select: ['id'],
          });
          accountIds = banks.map((b) => b.id);
        }
      } else {
        accountIds = await this.getAccountIdsByTenant(tenantId);
      }
      
      const accountsQuery = this.banksRepo.createQueryBuilder('bank');
      if (accountIds.length > 0) accountsQuery.andWhere('bank.id IN (:...accountIds)', { accountIds });
      const accounts = await accountsQuery.where('bank.isActive = :isActive', { isActive: true }).getMany();
      const totalBalance = accounts.reduce((acc, accItem) => acc + Number(accItem.balance), 0);

      // Flujo del mes actual
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const monthlyMovementsQuery = this.movementsRepo
        .createQueryBuilder('movement')
        .where('movement.createdAt >= :startDate', { startDate: firstDayOfMonth })
        .andWhere('movement.createdAt <= :endDate', { endDate: lastDayOfMonth });
      if (accountIds.length > 0) monthlyMovementsQuery.andWhere('movement.accountId IN (:...accountIds)', { accountIds });
      const monthlyMovements = await monthlyMovementsQuery.getMany();

      const monthlyIncome = monthlyMovements
        .filter((m) => m.type === 'INCOME')
        .reduce((acc, m) => acc + Number(m.amount), 0);
      const monthlyExpense = monthlyMovements
        .filter((m) => m.type === 'EXPENSE')
        .reduce((acc, m) => acc + Number(m.amount), 0);
      const monthlyNet = monthlyIncome - monthlyExpense;

      // Flujo del mes anterior
      const firstDayOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

      const lastMonthMovementsQuery = this.movementsRepo
        .createQueryBuilder('movement')
        .where('movement.createdAt >= :startDate', { startDate: firstDayOfLastMonth })
        .andWhere('movement.createdAt <= :endDate', { endDate: lastDayOfLastMonth });
      if (accountIds.length > 0) lastMonthMovementsQuery.andWhere('movement.accountId IN (:...accountIds)', { accountIds });
      const lastMonthMovements = await lastMonthMovementsQuery.getMany();

      const lastMonthIncome = lastMonthMovements
        .filter((m) => m.type === 'INCOME')
        .reduce((acc, m) => acc + Number(m.amount), 0);
      const lastMonthExpense = lastMonthMovements
        .filter((m) => m.type === 'EXPENSE')
        .reduce((acc, m) => acc + Number(m.amount), 0);
      const lastMonthNet = lastMonthIncome - lastMonthExpense;

      // Top 5 cuentas con mayor saldo
      const topAccounts = accounts
        .sort((a, b) => Number(b.balance) - Number(a.balance))
        .slice(0, 5)
        .map((acc) => ({
          id: acc.id,
          name: acc.name,
          bank: acc.bank,
          accountNumber: acc.accountNumber,
          balance: Number(acc.balance),
        }));

      // Alertas: cuentas con saldo bajo el mínimo configurado (usando 0 como mínimo por defecto)
      const lowBalanceAlerts = accounts
        .filter((acc) => Number(acc.balance) < 0)
        .map((acc) => ({
          id: acc.id,
          name: acc.name,
          balance: Number(acc.balance),
          minBalance: 0,
          deficit: 0 - Number(acc.balance),
        }));

      return {
        totalBalance,
        monthlyFlow: {
          income: monthlyIncome,
          expense: monthlyExpense,
          net: monthlyNet,
        },
        lastMonthFlow: {
          income: lastMonthIncome,
          expense: lastMonthExpense,
          net: lastMonthNet,
        },
        comparison: {
          netChange: monthlyNet - lastMonthNet,
          netChangePercent: lastMonthNet === 0 ? 0 : ((monthlyNet - lastMonthNet) / Math.abs(lastMonthNet)) * 100,
        },
        topAccounts,
        lowBalanceAlerts,
      };
    } catch (error) {
      console.error('TreasuryService.getExecutiveSummary error:', error);
      throw new Error(`Error al obtener resumen ejecutivo: ${error.message}`);
    }
  }

  async getCashFlowForecast(days: number = 30, tenantId?: string, branchId?: string, companyId?: string) {
    try {
      let accountIds: string[];
      if (branchId) {
        const banks = await this.banksRepo.find({
          where: { branchId },
          select: ['id'],
        });
        accountIds = banks.map((b) => b.id);
      } else if (companyId) {
        const branches = await this.banksRepo.manager.getRepository(Branch).find({
          where: { companyId },
          select: ['id'],
        });
        const branchIds = branches.map((b) => b.id);
        
        if (branchIds.length === 0) {
          accountIds = [];
        } else {
          const banks = await this.banksRepo.find({
            where: { branchId: In(branchIds) },
            select: ['id'],
          });
          accountIds = banks.map((b) => b.id);
        }
      } else {
        accountIds = await this.getAccountIdsByTenant(tenantId);
      }
      const now = new Date();
      
      // Saldo actual total
      const accountsQuery = this.banksRepo.createQueryBuilder('bank');
      if (accountIds.length > 0) accountsQuery.andWhere('bank.id IN (:...accountIds)', { accountIds });
      const accounts = await accountsQuery.where('bank.isActive = :isActive', { isActive: true }).getMany();
      const currentBalance = accounts.reduce((acc, accItem) => acc + Number(accItem.balance), 0);

      // Calcular promedios de los últimos 3 meses
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const historicalMovementsQuery = this.movementsRepo
        .createQueryBuilder('movement')
        .where('movement.createdAt >= :startDate', { startDate: threeMonthsAgo })
        .andWhere('movement.createdAt < :endDate', { endDate: currentMonthStart });
      if (accountIds.length > 0) historicalMovementsQuery.andWhere('movement.accountId IN (:...accountIds)', { accountIds });
      const historicalMovements = await historicalMovementsQuery.getMany();

      const historicalIncome = historicalMovements
        .filter((m) => m.type === 'INCOME')
        .reduce((acc, m) => acc + Number(m.amount), 0);
      const historicalExpense = historicalMovements
        .filter((m) => m.type === 'EXPENSE')
        .reduce((acc, m) => acc + Number(m.amount), 0);

      // Promedio diario de los últimos 3 meses (aprox 90 días)
      const daysInPeriod = 90;
      const avgDailyIncome = historicalIncome / daysInPeriod;
      const avgDailyExpense = historicalExpense / daysInPeriod;

      // CxP pendientes con fecha de vencimiento (usando dueDate si existe, o createdAt)
      const futureDate = new Date();
      futureDate.setDate(now.getDate() + days);

      const upcomingPaymentsQuery = this.movementsRepo
        .createQueryBuilder('movement')
        .where('movement.type = :type', { type: 'EXPENSE' })
        .andWhere('movement.createdAt >= :now', { now })
        .andWhere('movement.createdAt <= :futureDate', { futureDate });
      if (accountIds.length > 0) upcomingPaymentsQuery.andWhere('movement.accountId IN (:...accountIds)', { accountIds });
      const upcomingPayments = await upcomingPaymentsQuery.getMany();

      // Calcular saldo proyectado por fecha
      const dailyForecast: Array<{ date: string; income: number; expense: number; balance: number; expectedMovements: number }> = [];
      let runningBalance = currentBalance;

      for (let i = 0; i <= days; i++) {
        const date = new Date(now);
        date.setDate(now.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];

        // Ingresos proyectados: promedio histórico + movimientos esperados ese día
        const dayIncome = avgDailyIncome;

        // Egresos proyectados: promedio histórico + pagos pendientes ese día
        const dayExpense = avgDailyExpense + upcomingPayments
          .filter((m) => m.createdAt.toISOString().split('T')[0] === dateStr)
          .reduce((acc, m) => acc + Number(m.amount), 0);

        const expectedMovements = upcomingPayments
          .filter((m) => m.createdAt.toISOString().split('T')[0] === dateStr).length;

        runningBalance += dayIncome - dayExpense;

        dailyForecast.push({
          date: dateStr,
          income: Math.round(dayIncome * 100) / 100,
          expense: Math.round(dayExpense * 100) / 100,
          balance: Math.round(runningBalance * 100) / 100,
          expectedMovements,
        });
      }

      return {
        period: days,
        currentBalance,
        avgDailyIncome: Math.round(avgDailyIncome * 100) / 100,
        avgDailyExpense: Math.round(avgDailyExpense * 100) / 100,
        projectedBalance: Math.round(runningBalance * 100) / 100,
        dailyForecast,
      };
    } catch (error) {
      console.error('TreasuryService.getCashFlowForecast error:', error);
      throw new Error(`Error al obtener flujo de caja proyectado: ${error.message}`);
    }
  }

  async getBankPosition(tenantId?: string, branchId?: string, companyId?: string) {
    try {
      let accountIds: string[];
      if (branchId) {
        const banks = await this.banksRepo.find({
          where: { branchId },
          select: ['id'],
        });
        accountIds = banks.map((b) => b.id);
      } else if (companyId) {
        const branches = await this.banksRepo.manager.getRepository(Branch).find({
          where: { companyId },
          select: ['id'],
        });
        const branchIds = branches.map((b) => b.id);
        
        if (branchIds.length === 0) {
          accountIds = [];
        } else {
          const banks = await this.banksRepo.find({
            where: { branchId: In(branchIds) },
            select: ['id'],
          });
          accountIds = banks.map((b) => b.id);
        }
      } else {
        accountIds = await this.getAccountIdsByTenant(tenantId);
      }
      
      const accountsQuery = this.banksRepo.createQueryBuilder('bank');
      if (accountIds.length > 0) accountsQuery.andWhere('bank.id IN (:...accountIds)', { accountIds });
      const accounts = await accountsQuery.where('bank.isActive = :isActive', { isActive: true }).getMany();

      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

      const accountsWithDetails = await Promise.all(
        accounts.map(async (account) => {
          // Movimientos del día
          const todayMovementsQuery = this.movementsRepo
            .createQueryBuilder('movement')
            .where('movement.accountId = :accountId', { accountId: account.id })
            .andWhere('movement.createdAt >= :startDate', { startDate: startOfDay })
            .andWhere('movement.createdAt < :endDate', { endDate: endOfDay });
          const todayMovements = await todayMovementsQuery.getMany();

          const todayIncome = todayMovements
            .filter((m) => m.type === 'INCOME')
            .reduce((acc, m) => acc + Number(m.amount), 0);
          const todayExpense = todayMovements
            .filter((m) => m.type === 'EXPENSE')
            .reduce((acc, m) => acc + Number(m.amount), 0);

          return {
            id: account.id,
            name: account.name,
            bank: account.bank,
            accountNumber: account.accountNumber,
            balance: Number(account.balance),
            minBalance: 0,
            todayMovements: todayMovements.length,
            todayIncome,
            todayExpense,
            todayNet: todayIncome - todayExpense,
            lastReconciliation: null,
          };
        }),
      );

      return {
        accounts: accountsWithDetails,
        totalBalance: accountsWithDetails.reduce((acc, accItem) => acc + accItem.balance, 0),
        totalTodayIncome: accountsWithDetails.reduce((acc, accItem) => acc + accItem.todayIncome, 0),
        totalTodayExpense: accountsWithDetails.reduce((acc, accItem) => acc + accItem.todayExpense, 0),
      };
    } catch (error) {
      console.error('TreasuryService.getBankPosition error:', error);
      throw new Error(`Error al obtener posición bancaria: ${error.message}`);
    }
  }

  async getAlerts(tenantId?: string, branchId?: string, companyId?: string) {
    try {
      let accountIds: string[];
      if (branchId) {
        const banks = await this.banksRepo.find({
          where: { branchId },
          select: ['id'],
        });
        accountIds = banks.map((b) => b.id);
      } else if (companyId) {
        const branches = await this.banksRepo.manager.getRepository(Branch).find({
          where: { companyId },
          select: ['id'],
        });
        const branchIds = branches.map((b) => b.id);
        
        if (branchIds.length === 0) {
          accountIds = [];
        } else {
          const banks = await this.banksRepo.find({
            where: { branchId: In(branchIds) },
            select: ['id'],
          });
          accountIds = banks.map((b) => b.id);
        }
      } else {
        accountIds = await this.getAccountIdsByTenant(tenantId);
      }
      
      const accountsQuery = this.banksRepo.createQueryBuilder('bank');
      if (accountIds.length > 0) accountsQuery.andWhere('bank.id IN (:...accountIds)', { accountIds });
      const accounts = await accountsQuery.where('bank.isActive = :isActive', { isActive: true }).getMany();

      // Cuentas con saldo bajo mínimo (usando 0 como mínimo)
      const lowBalanceAccounts = accounts
        .filter((acc) => Number(acc.balance) < 0)
        .map((acc) => ({
          type: 'LOW_BALANCE',
          message: `Cuenta ${acc.name} con saldo bajo`,
          account: acc.name,
          balance: Number(acc.balance),
          minBalance: 0,
          severity: 'WARNING',
        }));

      // Facturas vencidas sin pagar (simulado - usaría fechas de vencimiento reales)
      const now = new Date();
      const overdueInvoicesQuery = this.movementsRepo
        .createQueryBuilder('movement')
        .where('movement.type = :type', { type: 'EXPENSE' })
        .andWhere('movement.createdAt < :date', { date: now })
        .limit(10);
      if (accountIds.length > 0) overdueInvoicesQuery.andWhere('movement.accountId IN (:...accountIds)', { accountIds });
      const overdueInvoices = await overdueInvoicesQuery.getMany();

      const overdueAlerts = overdueInvoices.map((m) => ({
        type: 'OVERDUE',
        message: `Pago vencido: ${m.concept}`,
        concept: m.concept,
        amount: Number(m.amount),
        date: m.createdAt,
        severity: 'ERROR',
      }));

      // Próximos vencimientos (7, 15, 30 días)
      const sevenDays = new Date();
      sevenDays.setDate(now.getDate() + 7);

      const fifteenDays = new Date();
      fifteenDays.setDate(now.getDate() + 15);

      const thirtyDays = new Date();
      thirtyDays.setDate(now.getDate() + 30);

      const upcomingPaymentsQuery = this.movementsRepo
        .createQueryBuilder('movement')
        .where('movement.type = :type', { type: 'EXPENSE' })
        .andWhere('movement.createdAt >= :now', { now })
        .andWhere('movement.createdAt <= :thirtyDays', { thirtyDays });
      if (accountIds.length > 0) upcomingPaymentsQuery.andWhere('movement.accountId IN (:...accountIds)', { accountIds });
      const upcomingPayments = await upcomingPaymentsQuery.getMany();

      const upcomingAlerts = upcomingPayments.map((m) => {
        const daysUntil = Math.ceil((m.createdAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        let severity = 'INFO';
        if (daysUntil <= 7) severity = 'WARNING';
        if (daysUntil <= 3) severity = 'ERROR';

        return {
          type: 'UPCOMING',
          message: `Próximo pago: ${m.concept}`,
          concept: m.concept,
          amount: Number(m.amount),
          date: m.createdAt,
          daysUntil,
          severity,
        };
      });

      // Transferencias pendientes de autorización (Transfer entity con status PENDIENTE)
      const pendingTransfersQuery = this.transfersRepo
        .createQueryBuilder('transfer')
        .where('transfer.status = :status', { status: 'PENDIENTE' })
        .orderBy('transfer.createdAt', 'DESC')
        .limit(10);
      const pendingTransfersRaw = await pendingTransfersQuery.getMany();

      const pendingAlerts = pendingTransfersRaw.map((t) => ({
        type: 'PENDING',
        message: `Traslado pendiente de autorización: ${t.concept || 'Sin concepto'}`,
        concept: t.concept,
        amount: Number(t.amount),
        date: t.createdAt,
        severity: 'WARNING',
      }));

      return {
        lowBalanceAccounts,
        overdueAlerts,
        upcomingAlerts,
        pendingAlerts,
        totalAlerts:
          lowBalanceAccounts.length +
          overdueAlerts.length +
          upcomingAlerts.length +
          pendingAlerts.length,
      };
    } catch (error) {
      console.error('TreasuryService.getAlerts error:', error);
      throw new Error(`Error al obtener alertas: ${error.message}`);
    }
  }

  // Payment Schedule CRUD
  async getScheduledPayments(tenantId?: string, branchId?: string, companyId?: string) {
    try {
      const query = this.paymentScheduleRepo.createQueryBuilder('payment');
      if (tenantId) query.andWhere('payment.tenantId = :tenantId', { tenantId });
      if (branchId) query.andWhere('payment.branchId = :branchId', { branchId });
      if (companyId) {
        const branches = await this.banksRepo.manager.getRepository(Branch).find({
          where: { companyId },
          select: ['id'],
        });
        const branchIds = branches.map((b) => b.id);
        if (branchIds.length > 0) {
          query.andWhere('payment.branchId IN (:...branchIds)', { branchIds });
        } else {
          return [];
        }
      }
      return query.orderBy('payment.fechaProgramada', 'ASC').getMany();
    } catch (error) {
      console.error('TreasuryService.getScheduledPayments error:', error);
      throw new Error(`Error al obtener pagos programados: ${error.message}`);
    }
  }

  async createScheduledPayment(data: {
    concepto: string;
    monto: number;
    cuentaOrigenId: string;
    fechaProgramada: Date;
    tipo: 'INGRESO' | 'EGRESO';
    referencia?: string;
    notas?: string;
    tenantId?: string;
  }) {
    try {
      const payment = this.paymentScheduleRepo.create(data);
      return this.paymentScheduleRepo.save(payment);
    } catch (error) {
      console.error('TreasuryService.createScheduledPayment error:', error);
      throw new Error(`Error al crear pago programado: ${error.message}`);
    }
  }

  async updateScheduledPayment(id: string, data: Partial<PaymentSchedule>) {
    try {
      await this.paymentScheduleRepo.update(id, data);
      return this.paymentScheduleRepo.findOne({ where: { id } });
    } catch (error) {
      console.error('TreasuryService.updateScheduledPayment error:', error);
      throw new Error(`Error al actualizar pago programado: ${error.message}`);
    }
  }

  async deleteScheduledPayment(id: string) {
    try {
      await this.paymentScheduleRepo.delete(id);
      return { id };
    } catch (error) {
      console.error('TreasuryService.deleteScheduledPayment error:', error);
      throw new Error(`Error al eliminar pago programado: ${error.message}`);
    }
  }

  // Transfer between accounts
  async createTransfer(data: {
    cuentaOrigenId: string;
    cuentaDestinoId: string;
    monto: number;
    concepto: string;
    fecha?: Date;
    referencia?: string;
    tenantId?: string;
  }) {
    try {
      const originAccount = await this.banksRepo.findOne({ where: { id: data.cuentaOrigenId } });
      const destAccount = await this.banksRepo.findOne({ where: { id: data.cuentaDestinoId } });

      if (!originAccount || !destAccount) {
        throw new Error('Cuentas no encontradas');
      }

      if (Number(originAccount.balance) < data.monto) {
        throw new Error('Saldo insuficiente en cuenta origen');
      }

      // Create expense movement for origin account
      const expenseMovement = this.movementsRepo.create({
        accountId: data.cuentaOrigenId,
        type: 'EXPENSE',
        amount: data.monto,
        concept: `Transferencia a ${destAccount.name} - ${data.concepto}`,
        reference: data.referencia,
      });
      await this.movementsRepo.save(expenseMovement);

      // Create income movement for destination account
      const incomeMovement = this.movementsRepo.create({
        accountId: data.cuentaDestinoId,
        type: 'INCOME',
        amount: data.monto,
        concept: `Transferencia desde ${originAccount.name} - ${data.concepto}`,
        reference: data.referencia,
      });
      await this.movementsRepo.save(incomeMovement);

      // Update account balances
      originAccount.balance = Number(originAccount.balance) - data.monto;
      destAccount.balance = Number(destAccount.balance) + data.monto;
      await this.banksRepo.save([originAccount, destAccount]);

      return {
        expenseMovement,
        incomeMovement,
        originBalance: originAccount.balance,
        destBalance: destAccount.balance,
      };
    } catch (error) {
      console.error('TreasuryService.createTransfer error:', error);
      throw new Error(`Error al crear transferencia: ${error.message}`);
    }
  }

  // Accounts Payable (CxP)
  async getAccountsPayable(tenantId?: string, branchId?: string, companyId?: string) {
    try {
      // Purchase entity only has tenantId — no branchId column exists
      const where: any = { status: In(['PENDIENTE', 'PARCIAL']) };
      if (tenantId) where.tenantId = tenantId;
      if (companyId) {
        // Resolve company → tenant and filter by tenantId
        const company = await this.banksRepo.manager
          .getRepository(Company)
          .findOne({ where: { id: companyId }, select: ['tenantId'] });
        if (!company) return [];
        where.tenantId = company.tenantId;
      }
      
      const purchases = await this.purchasesRepo.find({
        where,
        relations: ['supplier'],
        order: { fechaVencimiento: 'ASC' },
      });
      
      const now = new Date();
      
      return purchases.map((p) => {
        const fechaVencimiento = p.fechaVencimiento ? new Date(p.fechaVencimiento) : now;
        const diasHastaVencimiento = Math.ceil((fechaVencimiento.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        return {
          id: p.id,
          numero: p.numero,
          supplierId: p.supplierId,
          supplierName: p.supplier?.nombre || 'N/A',
          monto: Number(p.total),
          montoPagado: Number(p.montoPagado),
          saldoPendiente: Number(p.total) - Number(p.montoPagado),
          fechaVencimiento: p.fechaVencimiento,
          diasHastaVencimiento,
          status: p.status,
          metodoPago: p.metodoPago,
        };
      });
    } catch (error) {
      console.error('TreasuryService.getAccountsPayable error:', error);
      throw new Error(`Error al obtener cuentas por pagar: ${error.message}`);
    }
  }

  // Accounts Receivable (CxC)
  async getAccountsReceivable(tenantId?: string, branchId?: string, companyId?: string) {
    try {
      const now = new Date();
      // Movement entity has no tenantId column — filter by accountId via banks instead
      // Show income movements from the last 90 days (createdAt <= now)
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(now.getDate() - 90);

      const query = this.movementsRepo
        .createQueryBuilder('movement')
        .where('movement.type = :type', { type: 'INCOME' })
        .andWhere('movement.createdAt >= :startDate', { startDate: ninetyDaysAgo })
        .andWhere('movement.createdAt <= :now', { now })
        .orderBy('movement.createdAt', 'DESC');

      if (branchId) {
        const banks = await this.banksRepo.find({
          where: { branchId },
          select: ['id'],
        });
        const accountIds = banks.map((b) => b.id);
        if (accountIds.length > 0) {
          query.andWhere('movement.accountId IN (:...accountIds)', { accountIds });
        } else {
          return [];
        }
      } else if (companyId) {
        const branches = await this.banksRepo.manager.getRepository(Branch).find({
          where: { companyId },
          select: ['id'],
        });
        const branchIds = branches.map((b) => b.id);
        if (branchIds.length > 0) {
          const banks = await this.banksRepo.find({
            where: { branchId: In(branchIds) },
            select: ['id'],
          });
          const accountIds = banks.map((b) => b.id);
          if (accountIds.length > 0) {
            query.andWhere('movement.accountId IN (:...accountIds)', { accountIds });
          } else {
            return [];
          }
        } else {
          return [];
        }
      }
      
      const movements = await query.getMany();
      
      return movements.map((m) => ({
        id: m.id,
        concepto: m.concept,
        monto: Number(m.amount),
        fechaEsperada: m.createdAt,
        cuentaId: m.accountId,
        referencia: m.reference,
        diasHastaCobro: Math.ceil((m.createdAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      }));
    } catch (error) {
      console.error('TreasuryService.getAccountsReceivable error:', error);
      throw new Error(`Error al obtener cuentas por cobrar: ${error.message}`);
    }
  }

  // Alert Configuration
  async getAlertConfig(tenantId?: string) {
    try {
      // For now, return default config. In a real system, this would be stored in a table
      return {
        saldoMinimo: 0,
        diasAnticipacionAlerta: 7,
        alertasActivas: true,
      };
    } catch (error) {
      console.error('TreasuryService.getAlertConfig error:', error);
      throw new Error(`Error al obtener configuración de alertas: ${error.message}`);
    }
  }

  async updateAlertConfig(data: {
    saldoMinimo?: number;
    diasAnticipacionAlerta?: number;
    alertasActivas?: boolean;
    tenantId?: string;
  }) {
    try {
      // For now, just return the data. In a real system, this would be stored in a table
      return { ...data, updatedAt: new Date() };
    } catch (error) {
      console.error('TreasuryService.updateAlertConfig error:', error);
      throw new Error(`Error al actualizar configuración de alertas: ${error.message}`);
    }
  }

  async getAgingReport(tenantId: string, companyId?: string) {
    try {
      // Purchase entity has no companyId column — filter only by tenantId
      if (!tenantId) {
        return { bucket0_30: 0, bucket31_60: 0, bucket61_90: 0, bucket90plus: 0, items: [], totalPendiente: 0 };
      }

      const purchases = await this.purchasesRepo.find({
        where: { tenantId },
        relations: ['supplier'],
      });

      const pending = purchases.filter(
        (p) => p.status === 'PENDIENTE' || p.status === 'PARCIAL',
      );

      const today = new Date();
      let bucket0_30 = 0;
      let bucket31_60 = 0;
      let bucket61_90 = 0;
      let bucket90plus = 0;
      const items: any[] = [];

      for (const p of pending) {
        const venc = p.fechaVencimiento ? new Date(p.fechaVencimiento) : null;
        const diasRaw = venc ? Math.floor((today.getTime() - venc.getTime()) / 86400000) : 0;
        const dias = Math.max(0, diasRaw); // negative = not yet due → treat as 0
        const monto = Number(p.total || 0);
        const saldoPendiente = Math.max(0, monto - Number(p.montoPagado || 0));

        const item = {
          id: p.id,
          proveedor: p.supplier?.nombre || p.supplier?.razonSocial || p.supplierId || '—',
          folio: p.numero || p.id,
          monto: saldoPendiente,
          diasVencido: dias,
          fechaVencimiento: venc,
        };
        items.push(item);

        if (dias <= 30) bucket0_30 += saldoPendiente;
        else if (dias <= 60) bucket31_60 += saldoPendiente;
        else if (dias <= 90) bucket61_90 += saldoPendiente;
        else bucket90plus += saldoPendiente;
      }

      return {
        bucket0_30,
        bucket31_60,
        bucket61_90,
        bucket90plus,
        items,
        totalPendiente: items.reduce((s, i) => s + i.monto, 0),
      };
    } catch (error) {
      console.error('TreasuryService.getAgingReport error:', error);
      throw new Error(`Error en aging report: ${error.message}`);
    }
  }

  async getPendingDeposits(tenantId: string, branchId?: string) {
    try {
      const where: any = { tenantId, status: 'CERRADO' };
      if (branchId) where.sucursalId = branchId;
      const shifts = await this.shiftsRepo.find({ where, order: { fecha: 'DESC' } });
      // Shifts that have cash but no confirmed deposit movement
      const result = shifts
        .filter((s) => Number(s.totalEfectivo) > 0)
        .map((s) => ({
          shiftId: s.id,
          cajero: s.cajero,
          sucursalId: s.sucursalId,
          fecha: s.fecha,
          totalEfectivo: Number(s.totalEfectivo),
          fondoInicial: Number(s.fondoInicial),
          montoDepositar: Math.max(0, Number(s.totalEfectivo) - Number(s.fondoInicial)),
        }));
      return { deposits: result, total: result.reduce((s, d) => s + d.montoDepositar, 0) };
    } catch (error) {
      console.error('TreasuryService.getPendingDeposits error:', error);
      throw new Error(`Error al obtener depósitos pendientes: ${error.message}`);
    }
  }

  async getTransferHistory(tenantId?: string, limit = 20) {
    try {
      const query = this.transfersRepo
        .createQueryBuilder('transfer')
        .orderBy('transfer.createdAt', 'DESC')
        .take(limit);
      if (tenantId) query.andWhere('transfer.tenantId = :tenantId', { tenantId });
      return query.getMany();
    } catch (error) {
      console.error('TreasuryService.getTransferHistory error:', error);
      return [];
    }
  }

  async confirmDeposit(shiftId: string, tenantId: string, bankId: string, amount: number) {
    try {
      const shift = await this.shiftsRepo.findOne({ where: { id: shiftId } });
      if (!shift) throw new Error('Turno no encontrado');

      // Create a movement in the bank
      const movement = this.movementsRepo.create({
        bankId,
        tenantId,
        tipo: 'DEPOSITO',
        monto: amount,
        descripcion: `Depósito en tránsito — turno ${shift.cajero} ${shift.fecha}`,
        fecha: new Date(),
        status: 'CONFIRMADO',
      } as any);
      const saved = (await this.movementsRepo.save(movement)) as any;

      // Mark shift totalDepositos
      await this.shiftsRepo.update(shiftId, {
        totalDepositos: amount,
      });

      return { success: true, movementId: saved.id };
    } catch (error) {
      console.error('TreasuryService.confirmDeposit error:', error);
      throw new Error(`Error al confirmar depósito: ${error.message}`);
    }
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bank } from '../banks/entities/bank.entity';
import { Movement } from '../movements/entities/movement.entity';

@Injectable()
export class TreasuryService {
  constructor(
    @InjectRepository(Bank)
    private banksRepo: Repository<Bank>,
    @InjectRepository(Movement)
    private movementsRepo: Repository<Movement>,
  ) {}

  async getExecutiveSummary() {
    try {
      const accounts = await this.banksRepo.find({ where: { isActive: true } });
      const totalBalance = accounts.reduce((acc, accItem) => acc + Number(accItem.balance), 0);

      // Flujo del mes actual
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const monthlyMovements = await this.movementsRepo
        .createQueryBuilder('movement')
        .where('movement.createdAt >= :startDate', { startDate: firstDayOfMonth })
        .andWhere('movement.createdAt <= :endDate', { endDate: lastDayOfMonth })
        .getMany();

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

      const lastMonthMovements = await this.movementsRepo
        .createQueryBuilder('movement')
        .where('movement.createdAt >= :startDate', { startDate: firstDayOfLastMonth })
        .andWhere('movement.createdAt <= :endDate', { endDate: lastDayOfLastMonth })
        .getMany();

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
          netChangePercent: lastMonthNet !== 0 ? ((monthlyNet - lastMonthNet) / Math.abs(lastMonthNet)) * 100 : 0,
        },
        topAccounts,
        lowBalanceAlerts,
      };
    } catch (error) {
      console.error('TreasuryService.getExecutiveSummary error:', error);
      throw new Error(`Error al obtener resumen ejecutivo: ${error.message}`);
    }
  }

  async getCashFlowForecast(days: number = 30) {
    try {
      const now = new Date();
      const futureDate = new Date();
      futureDate.setDate(now.getDate() + days);

      // Ingresos esperados (movimientos futuros de tipo INCOME)
      const expectedIncome = await this.movementsRepo
        .createQueryBuilder('movement')
        .where('movement.type = :type', { type: 'INCOME' })
        .andWhere('movement.createdAt >= :startDate', { startDate: now })
        .andWhere('movement.createdAt <= :endDate', { endDate: futureDate })
        .getMany();

      // Egresos esperados (movimientos futuros de tipo EXPENSE)
      const expectedExpense = await this.movementsRepo
        .createQueryBuilder('movement')
        .where('movement.type = :type', { type: 'EXPENSE' })
        .andWhere('movement.createdAt >= :startDate', { startDate: now })
        .andWhere('movement.createdAt <= :endDate', { endDate: futureDate })
        .getMany();

      // Saldo actual total
      const accounts = await this.banksRepo.find({ where: { isActive: true } });
      const currentBalance = accounts.reduce((acc, accItem) => acc + Number(accItem.balance), 0);

      // Calcular saldo proyectado por fecha
      const dailyForecast: Array<{ date: string; income: number; expense: number; balance: number }> = [];
      let runningBalance = currentBalance;

      for (let i = 0; i <= days; i++) {
        const date = new Date(now);
        date.setDate(now.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];

        const dayIncome = expectedIncome
          .filter((m) => m.createdAt.toISOString().split('T')[0] === dateStr)
          .reduce((acc, m) => acc + Number(m.amount), 0);

        const dayExpense = expectedExpense
          .filter((m) => m.createdAt.toISOString().split('T')[0] === dateStr)
          .reduce((acc, m) => acc + Number(m.amount), 0);

        runningBalance += dayIncome - dayExpense;

        dailyForecast.push({
          date: dateStr,
          income: dayIncome,
          expense: dayExpense,
          balance: runningBalance,
        });
      }

      return {
        period: days,
        totalExpectedIncome: expectedIncome.reduce((acc, m) => acc + Number(m.amount), 0),
        totalExpectedExpense: expectedExpense.reduce((acc, m) => acc + Number(m.amount), 0),
        netCashFlow: expectedIncome.reduce((acc, m) => acc + Number(m.amount), 0) - 
                     expectedExpense.reduce((acc, m) => acc + Number(m.amount), 0),
        currentBalance,
        projectedBalance: runningBalance,
        dailyForecast,
      };
    } catch (error) {
      console.error('TreasuryService.getCashFlowForecast error:', error);
      throw new Error(`Error al obtener flujo de caja proyectado: ${error.message}`);
    }
  }

  async getBankPosition() {
    try {
      const accounts = await this.banksRepo.find({ where: { isActive: true } });

      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

      const accountsWithDetails = await Promise.all(
        accounts.map(async (account) => {
          // Movimientos del día
          const todayMovements = await this.movementsRepo
            .createQueryBuilder('movement')
            .where('movement.accountId = :accountId', { accountId: account.id })
            .andWhere('movement.createdAt >= :startDate', { startDate: startOfDay })
            .andWhere('movement.createdAt < :endDate', { endDate: endOfDay })
            .getMany();

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

  async getAlerts() {
    try {
      const accounts = await this.banksRepo.find({ where: { isActive: true } });

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
      const overdueInvoices = await this.movementsRepo
        .createQueryBuilder('movement')
        .where('movement.type = :type', { type: 'EXPENSE' })
        .andWhere('movement.createdAt < :date', { date: now })
        .limit(10)
        .getMany();

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

      const upcomingPayments = await this.movementsRepo
        .createQueryBuilder('movement')
        .where('movement.type = :type', { type: 'EXPENSE' })
        .andWhere('movement.createdAt >= :now', { now })
        .andWhere('movement.createdAt <= :thirtyDays', { thirtyDays })
        .getMany();

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

      // Transferencias pendientes de autorización (simulado)
      const pendingTransfers = await this.movementsRepo
        .createQueryBuilder('movement')
        .where('movement.type = :type', { type: 'EXPENSE' })
        .orderBy('movement.createdAt', 'DESC')
        .limit(5)
        .getMany();

      const pendingAlerts = pendingTransfers.map((m) => ({
        type: 'PENDING',
        message: `Transferencia pendiente: ${m.concept}`,
        concept: m.concept,
        amount: Number(m.amount),
        date: m.createdAt,
        severity: 'INFO',
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
}

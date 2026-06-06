import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Company } from '../companies/entities/company.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Bank } from '../banks/entities/bank.entity';
import { Movement } from '../movements/entities/movement.entity';
import { DashboardMetric } from './entities/dashboard-metric.entity';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Company)
    private companiesRepo: Repository<Company>,
    @InjectRepository(Branch)
    private branchesRepo: Repository<Branch>,
    @InjectRepository(Bank)
    private banksRepo: Repository<Bank>,
    @InjectRepository(Movement)
    private movementsRepo: Repository<Movement>,
    @InjectRepository(DashboardMetric)
    private metricsRepo: Repository<DashboardMetric>,
  ) {}

  async getKpis(period: string = 'month', branchId?: string, tenantId?: string) {
    try {
      const now = new Date();
      let startDate: Date;
      let previousStartDate: Date;
      let previousEndDate: Date;

      // Calcular fechas según el período
      switch (period) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          previousStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
          previousEndDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 7);
          previousStartDate = new Date(now);
          previousStartDate.setDate(now.getDate() - 14);
          previousEndDate = startDate;
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          previousStartDate = new Date(now.getFullYear() - 1, 0, 1);
          previousEndDate = new Date(now.getFullYear() - 1, 11, 31);
          break;
        case 'month':
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          previousStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          previousEndDate = new Date(now.getFullYear(), now.getMonth(), 0);
          break;
      }

      // Si hay branchId, obtener cuentas de esa sucursal
      let bankQuery = this.banksRepo.createQueryBuilder('bank');
      if (branchId) {
        bankQuery = bankQuery.where('bank.branchId = :branchId', { branchId });
      } else if (tenantId) {
        // Vista consolidada: obtener cuentas de todas las sucursales del tenant
        const companies = await this.companiesRepo.find({ where: { tenantId } });
        const companyIds = companies.map(c => c.id);
        const branches = await this.branchesRepo.find({ where: { companyId: In(companyIds) } });
        const branchIds = branches.map(b => b.id);
        if (branchIds.length > 0) {
          bankQuery = bankQuery.where('bank.branchId IN (:...branchIds)', { branchIds });
        }
      }

      const balanceRaw = await bankQuery
        .select('COALESCE(SUM(bank.balance), 0)', 'total')
        .getRawOne();

      const totalBalance = Number(balanceRaw?.total || 0);

      // Ingresos y egresos del período actual
      let movementQuery = this.movementsRepo.createQueryBuilder('movement');
      if (branchId) {
        // Vista individual: filtrar por branchId a través de las cuentas
        const banks = await this.banksRepo.find({ where: { branchId } });
        const accountIds = banks.map(b => b.id);
        if (accountIds.length > 0) {
          movementQuery = movementQuery.where('movement.accountId IN (:...accountIds)', { accountIds });
        } else {
          movementQuery = movementQuery.where('1=0'); // Sin cuentas, sin movimientos
        }
      } else if (tenantId) {
        // Vista consolidada: filtrar por tenant a través de las cuentas
        const companies = await this.companiesRepo.find({ where: { tenantId } });
        const companyIds = companies.map(c => c.id);
        const branches = await this.branchesRepo.find({ where: { companyId: In(companyIds) } });
        const branchIds = branches.map(b => b.id);
        const banks = await this.banksRepo.find({ where: { branchId: In(branchIds) } });
        const accountIds = banks.map(b => b.id);
        if (accountIds.length > 0) {
          movementQuery = movementQuery.where('movement.accountId IN (:...accountIds)', { accountIds });
        } else {
          movementQuery = movementQuery.where('1=0');
        }
      }

      const currentIncomeRaw = await movementQuery
        .clone()
        .select('COALESCE(SUM(movement.amount), 0)', 'total')
        .andWhere('movement.type = :type', { type: 'INCOME' })
        .andWhere('movement.createdAt >= :startDate', { startDate })
        .andWhere('movement.createdAt <= :endDate', { endDate: now })
        .getRawOne();

      const currentExpenseRaw = await movementQuery
        .clone()
        .select('COALESCE(SUM(movement.amount), 0)', 'total')
        .andWhere('movement.type = :type', { type: 'EXPENSE' })
        .andWhere('movement.createdAt >= :startDate', { startDate })
        .andWhere('movement.createdAt <= :endDate', { endDate: now })
        .getRawOne();

      const currentIncome = Number(currentIncomeRaw?.total || 0);
      const currentExpense = Number(currentExpenseRaw?.total || 0);

      // Ingresos y egresos del período anterior
      const previousIncomeRaw = await movementQuery
        .clone()
        .select('COALESCE(SUM(movement.amount), 0)', 'total')
        .andWhere('movement.type = :type', { type: 'INCOME' })
        .andWhere('movement.createdAt >= :startDate', { startDate: previousStartDate })
        .andWhere('movement.createdAt <= :endDate', { endDate: previousEndDate })
        .getRawOne();

      const previousExpenseRaw = await movementQuery
        .clone()
        .select('COALESCE(SUM(movement.amount), 0)', 'total')
        .andWhere('movement.type = :type', { type: 'EXPENSE' })
        .andWhere('movement.createdAt >= :startDate', { startDate: previousStartDate })
        .andWhere('movement.createdAt <= :endDate', { endDate: previousEndDate })
        .getRawOne();

      const previousIncome = Number(previousIncomeRaw?.total || 0);
      const previousExpense = Number(previousExpenseRaw?.total || 0);

      // Calcular variaciones
      const incomeVariation = previousIncome === 0 ? 0 : ((currentIncome - previousIncome) / previousIncome) * 100;
      const expenseVariation = previousExpense === 0 ? 0 : ((currentExpense - previousExpense) / previousExpense) * 100;
      const previousBalance = previousIncome - previousExpense;
      const currentBalance = currentIncome - currentExpense;
      const balanceVariation = previousBalance === 0 ? 0 : ((currentBalance - previousBalance) / Math.abs(previousBalance)) * 100;

      // CxC y CxP (simulado - usaría tablas reales de facturas)
      const accountsReceivable = currentIncome * 0.15; // 15% pendiente
      const accountsPayable = currentExpense * 0.10; // 10% pendiente
      const pendingInvoices = Math.floor(Math.random() * 10) + 1;
      
      const nextDueDate = new Date();
      nextDueDate.setDate(now.getDate() + Math.floor(Math.random() * 14) + 1);

      const latestMovements = await movementQuery
        .clone()
        .orderBy('movement.createdAt', 'DESC')
        .take(5)
        .getMany();

      const incomeTotal = await movementQuery
        .clone()
        .select('COALESCE(SUM(movement.amount), 0)', 'total')
        .andWhere('movement.type = :type', { type: 'INCOME' })
        .getRawOne();

      const expenseTotal = await movementQuery
        .clone()
        .select('COALESCE(SUM(movement.amount), 0)', 'total')
        .andWhere('movement.type = :type', { type: 'EXPENSE' })
        .getRawOne();

      // Obtener desglose por empresa para vista consolidada
      const companiesBreakdown: Array<{
        companyId: string;
        companyName: string;
        balance: number;
        income: number;
        expense: number;
      }> = [];
      if (!branchId && tenantId) {
        const companies = await this.companiesRepo.find({ where: { tenantId } });
        for (const company of companies) {
          const companyBranches = await this.branchesRepo.find({ where: { companyId: company.id } });
          const companyBranchIds = companyBranches.map(b => b.id);
          
          if (companyBranchIds.length > 0) {
            const companyBanks = await this.banksRepo.find({ where: { branchId: In(companyBranchIds) } });
            const companyAccountIds = companyBanks.map(b => b.id);
            
            if (companyAccountIds.length > 0) {
              const companyBalanceRaw = await this.banksRepo
                .createQueryBuilder('bank')
                .select('COALESCE(SUM(bank.balance), 0)', 'total')
                .where('bank.id IN (:...accountIds)', { accountIds: companyAccountIds })
                .getRawOne();
              
              const companyIncomeRaw = await this.movementsRepo
                .createQueryBuilder('movement')
                .select('COALESCE(SUM(movement.amount), 0)', 'total')
                .where('movement.accountId IN (:...accountIds)', { accountIds: companyAccountIds })
                .andWhere('movement.type = :type', { type: 'INCOME' })
                .andWhere('movement.createdAt >= :startDate', { startDate })
                .andWhere('movement.createdAt <= :endDate', { endDate: now })
                .getRawOne();
              
              const companyExpenseRaw = await this.movementsRepo
                .createQueryBuilder('movement')
                .select('COALESCE(SUM(movement.amount), 0)', 'total')
                .where('movement.accountId IN (:...accountIds)', { accountIds: companyAccountIds })
                .andWhere('movement.type = :type', { type: 'EXPENSE' })
                .andWhere('movement.createdAt >= :startDate', { startDate })
                .andWhere('movement.createdAt <= :endDate', { endDate: now })
                .getRawOne();
              
              companiesBreakdown.push({
                companyId: company.id,
                companyName: company.tradeName || company.legalName,
                balance: Number(companyBalanceRaw?.total || 0),
                income: Number(companyIncomeRaw?.total || 0),
                expense: Number(companyExpenseRaw?.total || 0),
              });
            }
          }
        }
      }

      await this.metricsRepo.save([
        this.metricsRepo.create({ key: 'total_companies', value: companiesBreakdown.length }),
        this.metricsRepo.create({ key: 'total_balance', value: totalBalance }),
      ]);

      return {
        totalBalance,
        balanceVariation,
        income: currentIncome,
        expense: currentExpense,
        incomeVariation,
        expenseVariation,
        accountsReceivable,
        pendingInvoices,
        accountsPayable,
        nextDueDate: nextDueDate.toISOString().split('T')[0],
        latestMovements,
        chart: {
          income: Number(incomeTotal?.total || 0),
          expense: Number(expenseTotal?.total || 0),
        },
        companiesBreakdown,
      };
    } catch (error) {
      // Devolver datos en cero como fallback en lugar de error 500
      return {
        totalBalance: 0,
        balanceVariation: 0,
        income: 0,
        expense: 0,
        incomeVariation: 0,
        expenseVariation: 0,
        accountsReceivable: 0,
        pendingInvoices: 0,
        accountsPayable: 0,
        nextDueDate: new Date().toISOString().split('T')[0],
        latestMovements: [],
        chart: {
          income: 0,
          expense: 0,
        },
        companiesBreakdown: [],
      };
    }
  }
}

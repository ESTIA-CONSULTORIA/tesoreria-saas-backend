import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Movement } from '../movements/entities/movement.entity';
import { Bank } from '../banks/entities/bank.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Company } from '../companies/entities/company.entity';
import { Report } from './entities/report.entity';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Movement)
    private movementsRepo: Repository<Movement>,
    @InjectRepository(Bank)
    private banksRepo: Repository<Bank>,
    @InjectRepository(Branch)
    private branchesRepo: Repository<Branch>,
    @InjectRepository(Company)
    private companiesRepo: Repository<Company>,
    @InjectRepository(Report)
    private reportsRepo: Repository<Report>,
  ) {}

  // Cuentas del tenant del token (banco -> sucursal -> empresa -> tenant). La empresa (X-Company-Id, la controla el cliente)
  // solo estrecha DENTRO del tenant: antes, con companyId se ignoraba el tenant (reportes de cualquier empresa) y sin tenant
  // ni empresa los reportes sumaban los movimientos de TODOS los tenants. Sin tenant -> [] (y cada reporte devuelve vacío).
  private async resolveAccountIds(tenantId?: string, companyId?: string): Promise<string[]> {
    if (!tenantId) return [];
    const qb = this.banksRepo
      .createQueryBuilder('bank')
      .select('bank.id', 'id')
      .innerJoin(Branch, 'branch', 'branch.id::text = bank."branchId"::text')
      .innerJoin(Company, 'company', 'company.id::text = branch."companyId"::text')
      .where('company."tenantId"::text = :tenantId', { tenantId });
    if (companyId) qb.andWhere('company.id::text = :companyId', { companyId });
    const rows = await qb.getRawMany();
    return rows.map((r) => r.id);
  }

  async cashFlow(startDate?: string, endDate?: string, tenantId?: string, companyId?: string) {
    try {
      const accountIds = await this.resolveAccountIds(tenantId, companyId);
      const query = this.movementsRepo.createQueryBuilder('movement');

      if (accountIds.length > 0) {
        query.andWhere('movement.accountId IN (:...accountIds)', { accountIds });
      } else { // sin cuentas del tenant: reporte vacío, nunca todos los movimientos
        return { weekly: [], totalIncome: 0, totalExpense: 0, totalNet: 0 };
      }

      if (startDate) query.andWhere('movement.date >= :startDate', { startDate });
      if (endDate) query.andWhere('movement.date <= :endDate', { endDate: `${endDate} 23:59:59` });

      const movements = await query.getMany();

      const weeklyData: Record<string, { income: number; expense: number; net: number }> = {};

      movements.forEach((m) => {
        const date = new Date(m.date ?? m.createdAt);
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        const weekKey = weekStart.toISOString().split('T')[0];

        if (!weeklyData[weekKey]) {
          weeklyData[weekKey] = { income: 0, expense: 0, net: 0 };
        }

        if (m.type === 'INCOME') {
          weeklyData[weekKey].income += Number(m.amount);
        } else if (m.type === 'EXPENSE') {
          weeklyData[weekKey].expense += Number(m.amount);
        }
      });

      const result = Object.entries(weeklyData)
        .map(([week, data]) => ({
          week,
          income: data.income,
          expense: data.expense,
          net: data.income - data.expense,
        }))
        .sort((a, b) => a.week.localeCompare(b.week));

      const totalIncome = result.reduce((acc, r) => acc + r.income, 0);
      const totalExpense = result.reduce((acc, r) => acc + r.expense, 0);
      const totalNet = totalIncome - totalExpense;

      await this.reportsRepo.save(this.reportsRepo.create({
        type: 'cash-flow',
        payload: { startDate, endDate, tenantId, weekly: result, totalIncome, totalExpense, totalNet },
      }));

      return { weekly: result, totalIncome, totalExpense, totalNet };
    } catch (error) {
      console.error('ReportsService.cashFlow error:', error);
      return { weekly: [], totalIncome: 0, totalExpense: 0, totalNet: 0 };
    }
  }

  async balanceByAccount(tenantId?: string, companyId?: string) {
    try {
      const accountIds = await this.resolveAccountIds(tenantId, companyId);
      const query = this.banksRepo.createQueryBuilder('bank');

      if (accountIds.length > 0) {
        query.andWhere('bank.id IN (:...accountIds)', { accountIds });
      } else { // sin cuentas del tenant: reporte vacío, nunca todos los movimientos
        return [];
      }

      const accounts = await query.orderBy('bank.name', 'ASC').getMany();

      const data = accounts.map((acc) => ({
        accountId: acc.id,
        accountName: acc.name,
        bank: acc.bank,
        balance: Number(acc.balance),
        currency: acc.currency,
      }));

      await this.reportsRepo.save(this.reportsRepo.create({ type: 'balance-by-account', payload: data }));
      return data;
    } catch (error) {
      console.error('ReportsService.balanceByAccount error:', error);
      return [];
    }
  }

  async categorySummary(startDate?: string, endDate?: string, tenantId?: string, companyId?: string) {
    try {
      const accountIds = await this.resolveAccountIds(tenantId, companyId);
      const query = this.movementsRepo.createQueryBuilder('movement');

      if (accountIds.length > 0) {
        query.andWhere('movement.accountId IN (:...accountIds)', { accountIds });
      } else { // sin cuentas del tenant: reporte vacío, nunca todos los movimientos
        return [];
      }

      if (startDate) query.andWhere('movement.date >= :startDate', { startDate });
      if (endDate) query.andWhere('movement.date <= :endDate', { endDate: `${endDate} 23:59:59` });

      const rows = await query
        .select('movement.category', 'category')
        .addSelect('movement.type', 'type')
        .addSelect('SUM(movement.amount)', 'total')
        .groupBy('movement.category')
        .addGroupBy('movement.type')
        .orderBy('movement.category', 'ASC')
        .getRawMany();

      const data = rows.map((row) => ({
        category: row.category,
        type: row.type,
        total: Number(row.total),
      }));

      await this.reportsRepo.save(this.reportsRepo.create({ type: 'category-summary', payload: data }));
      return data;
    } catch (error) {
      console.error('ReportsService.categorySummary error:', error);
      return [];
    }
  }

  async incomeStatement(startDate?: string, endDate?: string, tenantId?: string, companyId?: string) {
    try {
      const accountIds = await this.resolveAccountIds(tenantId, companyId);
      const query = this.movementsRepo.createQueryBuilder('movement');

      if (accountIds.length > 0) {
        query.andWhere('movement.accountId IN (:...accountIds)', { accountIds });
      } else { // sin cuentas del tenant: reporte vacío, nunca todos los movimientos
        return this._emptyIncomeStatement();
      }

      if (startDate) query.andWhere('movement.date >= :startDate', { startDate });
      if (endDate) query.andWhere('movement.date <= :endDate', { endDate: `${endDate} 23:59:59` });

      const movements = await query.getMany();

      const sum = (type: string, category: string) =>
        movements
          .filter(m => m.type === type && m.category === category)
          .reduce((acc, m) => acc + Number(m.amount), 0);

      const ventas = sum('INCOME', 'VENTAS') || movements.filter(m => m.type === 'INCOME').reduce((acc, m) => acc + Number(m.amount), 0);
      const cortesiasDescuentos = sum('EXPENSE', 'CORTESIAS') + sum('EXPENSE', 'DESCUENTOS');
      const costoVenta = sum('EXPENSE', 'COSTO_VENTA');
      const gastosFijos = sum('EXPENSE', 'GASTOS_FIJOS') + sum('EXPENSE', 'RENT') + sum('EXPENSE', 'PAYROLL');
      const gastosVariables = sum('EXPENSE', 'GASTOS_VARIABLES') + sum('EXPENSE', 'SUPPLIES') + sum('EXPENSE', 'SERVICES') + sum('EXPENSE', 'OPERATIONAL');
      const impuestos = sum('EXPENSE', 'IMPUESTOS');
      const inversiones = sum('EXPENSE', 'INVERSIONES');

      const utilidadBruta = ventas - cortesiasDescuentos - costoVenta;
      const gastosOperativos = gastosFijos + gastosVariables;
      const utilidadOperativa = utilidadBruta - gastosOperativos;
      const utilidadReal = utilidadOperativa - impuestos - inversiones;
      const ebitda = utilidadOperativa;

      const data = {
        ingresos: { ventas, cortesiasDescuentos, totalIngresos: ventas - cortesiasDescuentos },
        costos: { costoVenta },
        utilidadBruta,
        gastosOperativos: { gastosFijos, gastosVariables, totalGastosOperativos: gastosOperativos },
        utilidadOperativa,
        ebitda,
        otros: { impuestos, inversiones },
        utilidadNeta: utilidadReal,
      };

      await this.reportsRepo.save(this.reportsRepo.create({ type: 'income-statement', payload: data }));
      return data;
    } catch (error) {
      console.error('ReportsService.incomeStatement error:', error);
      return this._emptyIncomeStatement();
    }
  }

  async breakEvenPoint(startDate?: string, endDate?: string, tenantId?: string, companyId?: string) {
    try {
      const accountIds = await this.resolveAccountIds(tenantId, companyId);
      const query = this.movementsRepo.createQueryBuilder('movement');

      if (accountIds.length > 0) {
        query.andWhere('movement.accountId IN (:...accountIds)', { accountIds });
      } else { // sin cuentas del tenant: reporte vacío, nunca todos los movimientos
        return this._emptyBreakEven();
      }

      if (startDate) query.andWhere('movement.date >= :startDate', { startDate });
      if (endDate) query.andWhere('movement.date <= :endDate', { endDate: `${endDate} 23:59:59` });

      const movements = await query.getMany();

      const sum = (type: string, category: string) =>
        movements
          .filter(m => m.type === type && m.category === category)
          .reduce((acc, m) => acc + Number(m.amount), 0);

      const ventas = sum('INCOME', 'VENTAS') || movements.filter(m => m.type === 'INCOME').reduce((acc, m) => acc + Number(m.amount), 0);
      const costoVenta = sum('EXPENSE', 'COSTO_VENTA');
      const gastosVariables = sum('EXPENSE', 'GASTOS_VARIABLES') + sum('EXPENSE', 'SUPPLIES') + sum('EXPENSE', 'SERVICES') + sum('EXPENSE', 'OPERATIONAL');
      const gastosFijos = sum('EXPENSE', 'GASTOS_FIJOS') + sum('EXPENSE', 'RENT') + sum('EXPENSE', 'PAYROLL');

      const costoVariableTotal = costoVenta + gastosVariables;
      const margenContribucion = ventas > 0 ? 1 - costoVariableTotal / ventas : 0;
      const puntoEquilibrio = margenContribucion > 0 ? gastosFijos / margenContribucion : 0;

      const data = { ventas, costoVenta, gastosVariables, gastosFijos, costoVariableTotal, margenContribucion, puntoEquilibrio };

      await this.reportsRepo.save(this.reportsRepo.create({ type: 'break-even-point', payload: data }));
      return data;
    } catch (error) {
      console.error('ReportsService.breakEvenPoint error:', error);
      return this._emptyBreakEven();
    }
  }

  private _emptyIncomeStatement() {
    return {
      ingresos: { ventas: 0, cortesiasDescuentos: 0, totalIngresos: 0 },
      costos: { costoVenta: 0 },
      utilidadBruta: 0,
      gastosOperativos: { gastosFijos: 0, gastosVariables: 0, totalGastosOperativos: 0 },
      utilidadOperativa: 0,
      ebitda: 0,
      otros: { impuestos: 0, inversiones: 0 },
      utilidadNeta: 0,
    };
  }

  private _emptyBreakEven() {
    return { ventas: 0, costoVenta: 0, gastosVariables: 0, gastosFijos: 0, costoVariableTotal: 0, margenContribucion: 0, puntoEquilibrio: 0 };
  }
}

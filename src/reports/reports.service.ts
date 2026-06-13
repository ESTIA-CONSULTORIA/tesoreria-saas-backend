import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Movement } from '../movements/entities/movement.entity';
import { Bank } from '../banks/entities/bank.entity';
import { Report } from './entities/report.entity';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Movement)
    private movementsRepo: Repository<Movement>,
    @InjectRepository(Bank)
    private banksRepo: Repository<Bank>,
    @InjectRepository(Report)
    private reportsRepo: Repository<Report>,
  ) {}

  async cashFlow(startDate?: string, endDate?: string, tenantId?: string, companyId?: string) {
    try {
      const query = this.movementsRepo.createQueryBuilder('movement');

      if (tenantId) query.andWhere('movement.tenantId = :tenantId', { tenantId });
      if (companyId) query.andWhere('movement.accountId IN (SELECT id FROM bank WHERE branch_id IN (SELECT id FROM branch WHERE company_id = :companyId))', { companyId });
      if (startDate) query.andWhere('movement.createdAt >= :startDate', { startDate });
      if (endDate) query.andWhere('movement.createdAt <= :endDate', { endDate: `${endDate} 23:59:59` });

      const movements = await query.getMany();
      
      // Agrupar por semana
      const weeklyData: Record<string, { income: number; expense: number; net: number }> = {};
      
      movements.forEach((m) => {
        const date = new Date(m.createdAt);
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
      
      // Calcular neto y ordenar por semana
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
        payload: { startDate, endDate, tenantId, weekly: result, totalIncome, totalExpense, totalNet } 
      }));
      
      return { weekly: result, totalIncome, totalExpense, totalNet };
    } catch (error) {
      console.error('ReportsService.cashFlow error:', error);
      return { weekly: [], totalIncome: 0, totalExpense: 0, totalNet: 0 };
    }
  }

  async balanceByAccount(tenantId?: string, companyId?: string) {
    try {
      const query = this.banksRepo.createQueryBuilder('bank');
      if (tenantId) query.andWhere('bank.tenantId = :tenantId', { tenantId });
      if (companyId) query.andWhere('bank.branchId IN (SELECT id FROM branch WHERE company_id = :companyId)', { companyId });
      
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
      const query = this.movementsRepo.createQueryBuilder('movement');
      if (tenantId) query.andWhere('movement.tenantId = :tenantId', { tenantId });
      if (companyId) query.andWhere('movement.accountId IN (SELECT id FROM bank WHERE branch_id IN (SELECT id FROM branch WHERE company_id = :companyId))', { companyId });
      if (startDate) query.andWhere('movement.createdAt >= :startDate', { startDate });
      if (endDate) query.andWhere('movement.createdAt <= :endDate', { endDate: `${endDate} 23:59:59` });

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
      const query = this.movementsRepo.createQueryBuilder('movement');
      if (tenantId) query.andWhere('movement.tenantId = :tenantId', { tenantId });
      if (companyId) query.andWhere('movement.accountId IN (SELECT id FROM bank WHERE branch_id IN (SELECT id FROM branch WHERE company_id = :companyId))', { companyId });
      if (startDate) query.andWhere('movement.createdAt >= :startDate', { startDate });
      if (endDate) query.andWhere('movement.createdAt <= :endDate', { endDate: `${endDate} 23:59:59` });

      const movements = await query.getMany();

      // Categorías para el Estado de Resultados
      const ventas = movements
        .filter((m) => m.type === 'INCOME' && m.category === 'VENTAS')
        .reduce((acc, m) => acc + Number(m.amount), 0);

      const cortesiasDescuentos = movements
        .filter((m) => m.type === 'EXPENSE' && (m.category === 'CORTESIAS' || m.category === 'DESCUENTOS'))
        .reduce((acc, m) => acc + Number(m.amount), 0);

      const costoVenta = movements
        .filter((m) => m.type === 'EXPENSE' && m.category === 'COSTO_VENTA')
        .reduce((acc, m) => acc + Number(m.amount), 0);

      const gastosFijos = movements
        .filter((m) => m.type === 'EXPENSE' && m.category === 'GASTOS_FIJOS')
        .reduce((acc, m) => acc + Number(m.amount), 0);

      const gastosVariables = movements
        .filter((m) => m.type === 'EXPENSE' && m.category === 'GASTOS_VARIABLES')
        .reduce((acc, m) => acc + Number(m.amount), 0);

      const impuestos = movements
        .filter((m) => m.type === 'EXPENSE' && m.category === 'IMPUESTOS')
        .reduce((acc, m) => acc + Number(m.amount), 0);

      const inversiones = movements
        .filter((m) => m.type === 'EXPENSE' && m.category === 'INVERSIONES')
        .reduce((acc, m) => acc + Number(m.amount), 0);

      const utilidadBruta = ventas - cortesiasDescuentos - costoVenta;
      const gastosOperativos = gastosFijos + gastosVariables;
      const utilidadOperativa = utilidadBruta - gastosOperativos;
      const utilidadNetaAntesImpuestos = utilidadOperativa;
      const utilidadReal = utilidadNetaAntesImpuestos - impuestos - inversiones;
      
      // EBITDA estimado (Utilidad Operativa + Depreciación + Amortización)
      // Como no tenemos datos de depreciación/amortización, usamos Utilidad Operativa como estimación
      const ebitda = utilidadOperativa;

      const data = {
        ingresos: {
          ventas,
          cortesiasDescuentos,
          totalIngresos: ventas - cortesiasDescuentos,
        },
        costos: {
          costoVenta,
        },
        utilidadBruta,
        gastosOperativos: {
          gastosFijos,
          gastosVariables,
          totalGastosOperativos: gastosOperativos,
        },
        utilidadOperativa,
        ebitda,
        otros: {
          impuestos,
          inversiones,
        },
        utilidadNeta: utilidadReal,
      };

      await this.reportsRepo.save(this.reportsRepo.create({ type: 'income-statement', payload: data }));
      return data;
    } catch (error) {
      console.error('ReportsService.incomeStatement error:', error);
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
  }

  async breakEvenPoint(startDate?: string, endDate?: string, tenantId?: string, companyId?: string) {
    try {
      const query = this.movementsRepo.createQueryBuilder('movement');
      if (tenantId) query.andWhere('movement.tenantId = :tenantId', { tenantId });
      if (companyId) query.andWhere('movement.accountId IN (SELECT id FROM bank WHERE branch_id IN (SELECT id FROM branch WHERE company_id = :companyId))', { companyId });
      if (startDate) query.andWhere('movement.createdAt >= :startDate', { startDate });
      if (endDate) query.andWhere('movement.createdAt <= :endDate', { endDate: `${endDate} 23:59:59` });

      const movements = await query.getMany();

      const ventas = movements
        .filter((m) => m.type === 'INCOME' && m.category === 'VENTAS')
        .reduce((acc, m) => acc + Number(m.amount), 0);

      const costoVenta = movements
        .filter((m) => m.type === 'EXPENSE' && m.category === 'COSTO_VENTA')
        .reduce((acc, m) => acc + Number(m.amount), 0);

      const gastosVariables = movements
        .filter((m) => m.type === 'EXPENSE' && m.category === 'GASTOS_VARIABLES')
        .reduce((acc, m) => acc + Number(m.amount), 0);

      const gastosFijos = movements
        .filter((m) => m.type === 'EXPENSE' && m.category === 'GASTOS_FIJOS')
        .reduce((acc, m) => acc + Number(m.amount), 0);

      // Cálculo del Punto de Equilibrio
      // Punto de Equilibrio = Gastos Fijos / (1 - (Costo Variable Total / Ventas))
      const costoVariableTotal = costoVenta + gastosVariables;
      const margenContribucion = ventas > 0 ? 1 - costoVariableTotal / ventas : 0;
      const puntoEquilibrio = margenContribucion > 0 ? gastosFijos / margenContribucion : 0;

      const data = {
        ventas,
        costoVenta,
        gastosVariables,
        gastosFijos,
        costoVariableTotal,
        margenContribucion,
        puntoEquilibrio,
      };

      await this.reportsRepo.save(this.reportsRepo.create({ type: 'break-even-point', payload: data }));
      return data;
    } catch (error) {
      console.error('ReportsService.breakEvenPoint error:', error);
      return {
        ventas: 0,
        costoVenta: 0,
        gastosVariables: 0,
        gastosFijos: 0,
        costoVariableTotal: 0,
        margenContribucion: 0,
        puntoEquilibrio: 0,
      };
    }
  }
}

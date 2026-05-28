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

  async cashFlow(startDate?: string, endDate?: string) {
    const query = this.movementsRepo.createQueryBuilder('movement');

    if (startDate) query.andWhere('movement.createdAt >= :startDate', { startDate });
    if (endDate) query.andWhere('movement.createdAt <= :endDate', { endDate: `${endDate} 23:59:59` });

    const movements = await query.getMany();
    const income = movements.filter((m) => m.type === 'INCOME').reduce((acc, m) => acc + Number(m.amount), 0);
    const expense = movements.filter((m) => m.type === 'EXPENSE').reduce((acc, m) => acc + Number(m.amount), 0);
    const net = income - expense;

    await this.reportsRepo.save(this.reportsRepo.create({ type: 'cash-flow', payload: { startDate, endDate, income, expense, net } }));
    return { income, expense, net };
  }

  async balanceByAccount() {
    const accounts = await this.banksRepo.find({ order: { name: 'ASC' } });
    const data = accounts.map((acc) => ({
      accountId: acc.id,
      accountName: acc.name,
      bank: acc.bank,
      balance: Number(acc.balance),
      currency: acc.currency,
    }));
    await this.reportsRepo.save(this.reportsRepo.create({ type: 'balance-by-account', payload: data }));
    return data;
  }

  async categorySummary(startDate?: string, endDate?: string) {
    const query = this.movementsRepo.createQueryBuilder('movement');
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
  }

  async incomeStatement(startDate?: string, endDate?: string) {
    const query = this.movementsRepo.createQueryBuilder('movement');
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
    const utilidadNetaAntesImpuestos = utilidadBruta - gastosFijos - gastosVariables;
    const utilidadReal = utilidadNetaAntesImpuestos - impuestos - inversiones;

    const data = {
      ventas,
      cortesiasDescuentos,
      costoVenta,
      utilidadBruta,
      gastosFijos,
      gastosVariables,
      utilidadNetaAntesImpuestos,
      impuestos,
      inversiones,
      utilidadReal,
    };

    await this.reportsRepo.save(this.reportsRepo.create({ type: 'income-statement', payload: data }));
    return data;
  }

  async breakEvenPoint(startDate?: string, endDate?: string) {
    const query = this.movementsRepo.createQueryBuilder('movement');
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
  }
}

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
}

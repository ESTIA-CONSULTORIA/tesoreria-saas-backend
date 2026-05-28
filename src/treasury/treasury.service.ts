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

  async getSummary() {
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

    // Próximos vencimientos (simulado - en un sistema real tendría fechas de vencimiento)
    const upcomingPayments = await this.movementsRepo
      .createQueryBuilder('movement')
      .where('movement.type = :type', { type: 'EXPENSE' })
      .orderBy('movement.createdAt', 'DESC')
      .limit(5)
      .getMany();

    const upcomingCollections = await this.movementsRepo
      .createQueryBuilder('movement')
      .where('movement.type = :type', { type: 'INCOME' })
      .orderBy('movement.createdAt', 'DESC')
      .limit(5)
      .getMany();

    return {
      activeAccounts: accounts.length,
      totalBalance,
      monthlyFlow: {
        income: monthlyIncome,
        expense: monthlyExpense,
        net: monthlyNet,
      },
      upcomingPayments: upcomingPayments.map((m) => ({
        id: m.id,
        concept: m.concept,
        amount: Number(m.amount),
        date: m.createdAt,
      })),
      upcomingCollections: upcomingCollections.map((m) => ({
        id: m.id,
        concept: m.concept,
        amount: Number(m.amount),
        date: m.createdAt,
      })),
    };
  }
}

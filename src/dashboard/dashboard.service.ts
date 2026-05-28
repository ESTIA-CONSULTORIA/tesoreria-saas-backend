import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  async getKpis() {
    const totalCompanies = await this.companiesRepo.count();
    const totalBranches = await this.branchesRepo.count();

    const balanceRaw = await this.banksRepo
      .createQueryBuilder('bank')
      .select('COALESCE(SUM(bank.balance), 0)', 'total')
      .getRawOne();

    const totalBalance = Number(balanceRaw?.total || 0);

    const latestMovements = await this.movementsRepo.find({
      order: { createdAt: 'DESC' },
      take: 5,
    });

    const incomeRaw = await this.movementsRepo
      .createQueryBuilder('movement')
      .select('COALESCE(SUM(movement.amount), 0)', 'total')
      .where('movement.type = :type', { type: 'INCOME' })
      .getRawOne();

    const expenseRaw = await this.movementsRepo
      .createQueryBuilder('movement')
      .select('COALESCE(SUM(movement.amount), 0)', 'total')
      .where('movement.type = :type', { type: 'EXPENSE' })
      .getRawOne();

    const incomeTotal = Number(incomeRaw?.total || 0);
    const expenseTotal = Number(expenseRaw?.total || 0);

    await this.metricsRepo.save([
      this.metricsRepo.create({ key: 'total_companies', value: totalCompanies }),
      this.metricsRepo.create({ key: 'total_branches', value: totalBranches }),
      this.metricsRepo.create({ key: 'total_balance', value: totalBalance }),
    ]);

    return {
      totalCompanies,
      totalBranches,
      totalBalance,
      latestMovements,
      chart: {
        income: incomeTotal,
        expense: expenseTotal,
      },
    };
  }
}

import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Movement } from './entities/movement.entity';
import { Repository, In } from 'typeorm';
import { Bank } from '../banks/entities/bank.entity';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const APPROVAL_THRESHOLD = 50_000;

@Injectable()
export class MovementsService {
  constructor(
    @InjectRepository(Movement)
    private movementsRepository: Repository<Movement>,

    @InjectRepository(Bank)
    private banksRepository: Repository<Bank>,

    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  async create(
    accountId: string,
    type: string,
    category: string,
    concept: string,
    amount: number,
    reference?: string,
  ) {
    const normalizedType =
      type === 'INGRESO' ? 'INCOME' : type === 'EGRESO' ? 'EXPENSE' : type;

    const account = await this.banksRepository.findOne({
      where: { id: accountId },
    });

    if (!account) {
      throw new BadRequestException('Cuenta no encontrada');
    }

    const numericAmount = Number(amount);
    const currentBalance = Number(account.balance);
    if (normalizedType === 'INCOME') {
      account.balance = Number(currentBalance + numericAmount);
    } else if (normalizedType === 'EXPENSE') {
      if (currentBalance < numericAmount) {
        throw new BadRequestException('Saldo insuficiente');
      }
      account.balance = Number(currentBalance - numericAmount);
    } else {
      throw new BadRequestException('Tipo inválido');
    }

    await this.banksRepository.save(account);

    const requiresApproval = numericAmount >= APPROVAL_THRESHOLD;

    const movement = this.movementsRepository.create({
      accountId,
      type: normalizedType,
      category,
      concept,
      reference,
      amount: numericAmount,
      status: requiresApproval ? 'PENDING_APPROVAL' : 'APPROVED',
    });

    return this.movementsRepository.save(movement);
  }

  findAll() {
    return this.movementsRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findWithFilters(
    accountId?: string,
    type?: string,
    category?: string,
    startDate?: string,
    endDate?: string,
    page = 1,
    limit = 10,
  ) {
    const query = this.movementsRepository.createQueryBuilder('movement');

    if (accountId) {
      query.andWhere('movement.accountId = :accountId', { accountId });
    }

    if (type) {
      const normalizedType =
        type === 'INGRESO' ? 'INCOME' : type === 'EGRESO' ? 'EXPENSE' : type;
      query.andWhere('movement.type = :type', { type: normalizedType });
    }

    if (category) {
      query.andWhere('LOWER(movement.category) LIKE LOWER(:category)', {
        category: `%${category}%`,
      });
    }

    if (startDate) {
      query.andWhere('movement.createdAt >= :startDate', { startDate });
    }

    if (endDate) {
      query.andWhere('movement.createdAt <= :endDate', {
        endDate: `${endDate} 23:59:59`,
      });
    }

    const [data, total] = await query
      .orderBy('movement.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async approve(id: string, approvedBy: string): Promise<Movement> {
    const mov = await this.movementsRepository.findOne({ where: { id } });
    if (!mov) throw new NotFoundException('Movimiento no encontrado');
    await this.movementsRepository.update(id, {
      status: 'APPROVED',
      approvedBy,
      approvedAt: new Date(),
    });
    return this.movementsRepository.findOne({ where: { id } }) as Promise<Movement>;
  }

  async reject(id: string, approvedBy: string, reason: string): Promise<Movement> {
    const mov = await this.movementsRepository.findOne({ where: { id } });
    if (!mov) throw new NotFoundException('Movimiento no encontrado');
    await this.movementsRepository.update(id, {
      status: 'REJECTED',
      approvedBy,
      rejectionReason: reason,
    });
    return this.movementsRepository.findOne({ where: { id } }) as Promise<Movement>;
  }

  findByAccount(accountId: string) {
    return this.movementsRepository.find({
      where: { accountId },
      order: { createdAt: 'DESC' },
    });
  }

  async findByBranch(branchId: string) {
    const banks = await this.banksRepository.find({
      where: { branchId },
    });

    const accountIds = banks.map((bank) => bank.id);

    if (accountIds.length === 0) {
      return [];
    }

    return this.movementsRepository.find({
      where: { accountId: In(accountIds) } as any,
      order: { createdAt: 'DESC' },
    });
  }

  async findByCompany(companyId: string) {
    const branchIds = await this.dataSource
      .getRepository('Branch')
      .find({ where: { companyId }, select: ['id'] });
    
    const ids = branchIds.map(b => b.id);
    
    if (ids.length === 0) {
      return [];
    }
    
    const banks = await this.banksRepository.find({
      where: { branchId: In(ids) },
    });

    const accountIds = banks.map((bank) => bank.id);

    if (accountIds.length === 0) {
      return [];
    }

    return this.movementsRepository.find({
      where: { accountId: In(accountIds) },
      order: { createdAt: 'DESC' },
    });
  }
}
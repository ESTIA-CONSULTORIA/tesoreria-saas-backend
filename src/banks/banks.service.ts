import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Bank } from './entities/bank.entity';
import { Repository } from 'typeorm';

@Injectable()
export class BanksService {
  constructor(
    @InjectRepository(Bank)
    private banksRepository: Repository<Bank>,
  ) {}

  create(
    branchId: string,
    name: string,
    accountNumber: string,
    bank: string,
    initialBalance: number,
    currency: string,
    type: string,
  ) {
    const numericInitialBalance = Number(initialBalance || 0);

    const bankAccount = this.banksRepository.create({
      branchId,
      name,
      accountNumber,
      bank,
      initialBalance: numericInitialBalance,
      balance: numericInitialBalance,
      currency: currency || 'MXN',
      type,
      isActive: true,
    });

    return this.banksRepository.save(bankAccount);
  }

  findAll() {
    return this.banksRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  findByBranch(branchId: string) {
    return this.banksRepository.find({
      where: { branchId },
      order: { createdAt: 'DESC' },
    });
  }

  findOne(id: string) {
    return this.banksRepository.findOne({
      where: { id },
    });
  }

  async update(
    id: string,
    body: Partial<{
      branchId: string;
      name: string;
      accountNumber: string;
      bank: string;
      currency: string;
      type: string;
      isActive: boolean;
    }>,
  ) {
    const existing = await this.findOne(id);
    if (!existing) {
      throw new NotFoundException('Cuenta bancaria no encontrada');
    }

    await this.banksRepository.update(id, body);
    return this.findOne(id);
  }

  async remove(id: string) {
    const existing = await this.findOne(id);
    if (!existing) {
      throw new NotFoundException('Cuenta bancaria no encontrada');
    }

    await this.banksRepository.delete(id);
    return { deleted: true };
  }
}

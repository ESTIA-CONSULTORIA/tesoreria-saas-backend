import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Account } from './entities/account.entity';

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private accountsRepository: Repository<Account>,
  ) {}

  async create(
    branchId: string,
    name: string,
    type: string,
    currency?: string,
  ) {
    const normalizedType = type.toUpperCase();

    const allowedTypes = [
      'CASH',
      'BANK',
      'CREDIT_CARD',
      'SAVINGS',
    ];

    if (!allowedTypes.includes(normalizedType)) {
      throw new BadRequestException(
        'Tipo de cuenta inválido',
      );
    }

    const existingAccount = await this.accountsRepository.findOne({
      where: {
        branchId,
        name,
      },
    });

    if (existingAccount) {
      throw new BadRequestException(
        'Ya existe una cuenta con ese nombre',
      );
    }

    const account = this.accountsRepository.create({
      branchId,
      name,
      type: normalizedType,
      currency: currency || 'MXN',
      balance: 0,
      isActive: true,
    });

    return this.accountsRepository.save(account);
  }

  findAll() {
    return this.accountsRepository.find({
      order: {
        createdAt: 'DESC',
      },
    });
  }

  findByBranch(branchId: string) {
    return this.accountsRepository.find({
      where: { branchId },
      order: {
        createdAt: 'DESC',
      },
    });
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Account } from './entities/account.entity';
import { Repository } from 'typeorm';

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private accountsRepository: Repository<Account>,
  ) {}

  create(
    branchId: string,
    name: string,
    type: string,
    currency?: string,
  ) {
    const account = this.accountsRepository.create({
      branchId,
      name,
      type,
      currency: currency || 'MXN',
      balance: 0,
      isActive: true,
    });

    return this.accountsRepository.save(account);
  }

findAll() {
  return this.accountsRepository.find();
}

  findByBranch(branchId: string) {
    return this.accountsRepository.find({
      where: { branchId },
    });
  }
}
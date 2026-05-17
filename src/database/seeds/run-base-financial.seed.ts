import { DataSource } from 'typeorm';

import { Category } from '../../categories/entities/category.entity';
import { Account } from '../../accounts/entities/account.entity';
import {
  baseAccounts,
  baseCategories,
} from './base-financial.seed';

export async function runBaseFinancialSeed(dataSource: DataSource) {
  const categoryRepository = dataSource.getRepository(Category);
  const accountRepository = dataSource.getRepository(Account);

  for (const category of baseCategories) {
    const exists = await categoryRepository.findOne({
      where: {
        code: category.code,
      },
    });

    if (!exists) {
      await categoryRepository.save(categoryRepository.create(category));
    }
  }

  for (const account of baseAccounts) {
    const exists = await accountRepository.findOne({
      where: {
        name: account.name,
      },
    });

    if (!exists) {
      await accountRepository.save(
        accountRepository.create({
          ...account,
          branchId: 'default-branch',
        }),
      );
    }
  }

  return {
    success: true,
    categories: baseCategories.length,
    accounts: baseAccounts.length,
  };
}

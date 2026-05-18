import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  DataSource,
} from 'typeorm';

import { Transfer } from './entities/transfer.entity';
import { Account } from '../accounts/entities/account.entity';
import { Movement } from '../movements/entities/movement.entity';

@Injectable()
export class TransfersService {
  constructor(
    @InjectRepository(Transfer)
    private transferRepo: Repository<Transfer>,
    private dataSource: DataSource,
  ) {}

  async create(
    fromAccountId: string,
    toAccountId: string,
    amount: number,
    concept?: string,
  ) {
    const normalizedFromAccountId = String(
      fromAccountId || '',
    ).trim();

    const normalizedToAccountId = String(
      toAccountId || '',
    ).trim();

    const normalizedConcept = String(
      concept || '',
    ).trim();

    const numericAmount = Number(amount);

    if (
      normalizedFromAccountId === normalizedToAccountId
    ) {
      throw new BadRequestException(
        'No puedes transferir a la misma cuenta',
      );
    }

    if (!numericAmount || numericAmount <= 0) {
      throw new BadRequestException(
        'El monto debe ser mayor a cero',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const fromAccount = await manager.findOne(Account, {
        where: {
          id: normalizedFromAccountId,
        },
      });

      const toAccount = await manager.findOne(Account, {
        where: {
          id: normalizedToAccountId,
        },
      });

      if (!fromAccount || !toAccount) {
        throw new BadRequestException(
          'Cuenta no encontrada',
        );
      }

      const fromBalance = Number(fromAccount.balance);
      const toBalance = Number(toAccount.balance);

      if (fromBalance < numericAmount) {
        throw new BadRequestException(
          'Saldo insuficiente',
        );
      }

      fromAccount.balance = Number(
        fromBalance - numericAmount,
      );

      toAccount.balance = Number(
        toBalance + numericAmount,
      );

      await manager.save(fromAccount);
      await manager.save(toAccount);

      const transferReference = `TRANSFER-${Date.now()}`;

      const outMovement = manager.create(Movement, {
        accountId: normalizedFromAccountId,
        type: 'EXPENSE',
        category: 'TRANSFER',
        concept:
          normalizedConcept ||
          `Transferencia a ${normalizedToAccountId}`,
        reference: `${transferReference}-OUT`,
        amount: numericAmount,
      });

      const inMovement = manager.create(Movement, {
        accountId: normalizedToAccountId,
        type: 'INCOME',
        category: 'TRANSFER',
        concept:
          normalizedConcept ||
          `Transferencia desde ${normalizedFromAccountId}`,
        reference: `${transferReference}-IN`,
        amount: numericAmount,
      });

      await manager.save(outMovement);
      await manager.save(inMovement);

      const transfer = manager.create(Transfer, {
        fromAccountId: normalizedFromAccountId,
        toAccountId: normalizedToAccountId,
        amount: numericAmount,
        concept: normalizedConcept || null,
      });

      return manager.save(transfer);
    });
  }
}

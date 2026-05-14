import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Transfer } from './entities/transfer.entity';
import { Repository, DataSource } from 'typeorm';
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
    const numericAmount = Number(amount);

    if (fromAccountId === toAccountId) {
      throw new BadRequestException('No puedes transferir a la misma cuenta');
    }

    if (!numericAmount || numericAmount <= 0) {
      throw new BadRequestException('El monto debe ser mayor a cero');
    }

    return this.dataSource.transaction(async (manager) => {
      const fromAccount = await manager.findOne(Account, {
        where: { id: fromAccountId },
      });

      const toAccount = await manager.findOne(Account, {
        where: { id: toAccountId },
      });

      if (!fromAccount || !toAccount) {
        throw new BadRequestException('Cuenta no encontrada');
      }

      const fromBalance = Number(fromAccount.balance);
      const toBalance = Number(toAccount.balance);

      if (fromBalance < numericAmount) {
        throw new BadRequestException('Saldo insuficiente');
      }

      fromAccount.balance = Number(fromBalance - numericAmount);
      toAccount.balance = Number(toBalance + numericAmount);

      await manager.save(fromAccount);
      await manager.save(toAccount);

      const outMovement = manager.create(Movement, {
        accountId: fromAccountId,
        type: 'EXPENSE',
        category: 'TRANSFER',
        concept: concept || `Transferencia a ${toAccountId}`,
        reference: `TRANSFER-OUT-${Date.now()}`,
        amount: numericAmount,
      });

      const inMovement = manager.create(Movement, {
        accountId: toAccountId,
        type: 'INCOME',
        category: 'TRANSFER',
        concept: concept || `Transferencia desde ${fromAccountId}`,
        reference: `TRANSFER-IN-${Date.now()}`,
        amount: numericAmount,
      });

      await manager.save(outMovement);
      await manager.save(inMovement);

      const transfer = manager.create(Transfer, {
        fromAccountId,
        toAccountId,
        amount: numericAmount,
        concept,
      });

      return manager.save(transfer);
    });
  }
}
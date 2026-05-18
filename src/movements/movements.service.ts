import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Movement } from './entities/movement.entity';
import { Repository } from 'typeorm';
import { Account } from '../accounts/entities/account.entity';
import { Category } from '../categories/entities/category.entity';

@Injectable()
export class MovementsService {
  constructor(
    @InjectRepository(Movement)
    private movementsRepository: Repository<Movement>,

    @InjectRepository(Account)
    private accountsRepository: Repository<Account>,

    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
  ) {}

  async create(
    accountId: string,
    type: string,
    categoryCode: string,
    concept: string,
    amount: number,
    reference?: string,
  ) {
    // 1. validar cuenta
    const account = await this.accountsRepository.findOne({
      where: { id: accountId },
    });

    if (!account) {
      throw new BadRequestException('Cuenta no encontrada');
    }

    // 2. validar categoría
    const category = await this.categoriesRepository.findOne({
      where: { code: categoryCode },
    });

    if (!category) {
      throw new BadRequestException('Categoría no existe');
    }

    // 3. validar tipo vs categoría
    if (category.type !== type) {
      throw new BadRequestException(
        `La categoría ${category.code} no corresponde a ${type}`,
      );
    }

    const numericAmount = Number(amount);
    const currentBalance = Number(account.balance);

    if (numericAmount <= 0) {
      throw new BadRequestException(
        'El monto debe ser mayor a cero',
      );
    }

    // 4. actualizar saldo
    if (type === 'INCOME') {
      account.balance = Number(currentBalance + numericAmount);
    } else if (type === 'EXPENSE') {
      if (currentBalance < numericAmount) {
        throw new BadRequestException(
          'Fondos insuficientes',
        );
      }

      account.balance = Number(currentBalance - numericAmount);
    } else {
      throw new BadRequestException('Tipo inválido');
    }

    await this.accountsRepository.save(account);

    // 5. guardar movimiento
    const movement = this.movementsRepository.create({
      accountId,
      type,
      category: category.code,
      categoryId: category.id,
      concept,
      reference,
      amount: numericAmount,
    });

    return this.movementsRepository.save(movement);
  }

  findAll() {
    return this.movementsRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  findByAccount(accountId: string) {
    return this.movementsRepository.find({
      where: { accountId },
      order: { createdAt: 'DESC' },
    });
  }
}

import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Transfer } from './entities/transfer.entity';
import { Repository, DataSource } from 'typeorm';
import { Bank } from '../banks/entities/bank.entity';
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
    tipo: 'INTERNA' | 'INTERCOMPAÑIA' = 'INTERNA',
    empresaOrigenId?: string,
    empresaDestinoId?: string,
    referencia?: string,
    motivo?: string,
    tenantId?: string,
  ) {
    const numericAmount = Number(amount);

    if (fromAccountId === toAccountId) {
      throw new BadRequestException('No puedes transferir a la misma cuenta');
    }

    if (!numericAmount || numericAmount <= 0) {
      throw new BadRequestException('El monto debe ser mayor a cero');
    }

    if (tipo === 'INTERCOMPAÑIA' && (!empresaOrigenId || !empresaDestinoId)) {
      throw new BadRequestException('Para transferencias intercompañía se requieren las empresas origen y destino');
    }

    if (tipo === 'INTERCOMPAÑIA') {
      // Intercompañía: Create transfer with PENDIENTE status, no movements yet
      const transfer = this.transferRepo.create({
        tenantId,
        fromAccountId,
        toAccountId,
        amount: numericAmount,
        concept,
        tipo,
        status: 'PENDIENTE',
        empresaOrigenId,
        empresaDestinoId,
        referencia,
        motivo,
      });
      return this.transferRepo.save(transfer);
    }

    // INTERNA: Execute immediately with movements
    return this.dataSource.transaction(async (manager) => {
      const fromAccount = await manager.findOne(Bank, {
        where: { id: fromAccountId },
      });

      const toAccount = await manager.findOne(Bank, {
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
        concept: concept || `Traslado interno a ${toAccountId}`,
        reference: `TRANSFER-OUT-${Date.now()}`,
        amount: numericAmount,
      });

      const inMovement = manager.create(Movement, {
        accountId: toAccountId,
        type: 'INCOME',
        category: 'TRANSFER',
        concept: concept || `Traslado interno desde ${fromAccountId}`,
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
        tipo: 'INTERNA',
        status: 'AUTORIZADA',
        referencia,
        motivo,
      });

      return manager.save(transfer);
    });
  }

  async authorize(id: string) {
    const transfer = await this.transferRepo.findOne({ where: { id } });
    if (!transfer) {
      throw new BadRequestException('Transferencia no encontrada');
    }
    if (transfer.status !== 'PENDIENTE') {
      throw new BadRequestException('Solo se pueden autorizar transferencias pendientes');
    }
    if (transfer.tipo !== 'INTERCOMPAÑIA') {
      throw new BadRequestException('Solo se autorizan transferencias intercompañía');
    }

    return this.dataSource.transaction(async (manager) => {
      const fromAccount = await manager.findOne(Bank, {
        where: { id: transfer.fromAccountId },
      });

      const toAccount = await manager.findOne(Bank, {
        where: { id: transfer.toAccountId },
      });

      if (!fromAccount || !toAccount) {
        throw new BadRequestException('Cuenta no encontrada');
      }

      const fromBalance = Number(fromAccount.balance);
      const toBalance = Number(toAccount.balance);

      if (fromBalance < Number(transfer.amount)) {
        throw new BadRequestException('Saldo insuficiente');
      }

      fromAccount.balance = Number(fromBalance - Number(transfer.amount));
      toAccount.balance = Number(toBalance + Number(transfer.amount));

      await manager.save(fromAccount);
      await manager.save(toAccount);

      const outMovement = manager.create(Movement, {
        accountId: transfer.fromAccountId,
        type: 'EXPENSE',
        category: 'TRANSFER',
        concept: transfer.concept || `Traslado intercompañía a ${transfer.empresaDestinoId}`,
        reference: transfer.referencia || `TIC-${Date.now()}`,
        amount: Number(transfer.amount),
      });

      const inMovement = manager.create(Movement, {
        accountId: transfer.toAccountId,
        type: 'INCOME',
        category: 'TRANSFER',
        concept: transfer.concept || `Traslado intercompañía desde ${transfer.empresaOrigenId}`,
        reference: transfer.referencia || `TIC-${Date.now()}`,
        amount: Number(transfer.amount),
      });

      await manager.save(outMovement);
      await manager.save(inMovement);

      await manager.update(Transfer, id, { status: 'AUTORIZADA' });

      return manager.findOne(Transfer, { where: { id } });
    });
  }

  async reject(id: string, motivo: string) {
    if (!motivo || !motivo.trim()) {
      throw new BadRequestException('El motivo del rechazo es obligatorio');
    }
    const transfer = await this.transferRepo.findOne({ where: { id } });
    if (!transfer) {
      throw new BadRequestException('Transferencia no encontrada');
    }
    if (transfer.status !== 'PENDIENTE') {
      throw new BadRequestException('Solo se pueden rechazar transferencias pendientes');
    }

    await this.transferRepo.update(id, { status: 'RECHAZADA', motivo });
    return this.transferRepo.findOne({ where: { id } });
  }

  findAll(tenantId?: string) {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    return this.transferRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }
}
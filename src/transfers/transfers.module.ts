import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransfersService } from './transfers.service';
import { TransfersController } from './transfers.controller';
import { Transfer } from './entities/transfer.entity';
import { Bank } from '../banks/entities/bank.entity';

@Module({
  // Bank agregado para el hallazgo #1 de la auditoría BUSINESS (verificación de tenant
  // en create()/authorize()/reject() antes de mutar saldos de OTRO tenant).
  imports: [TypeOrmModule.forFeature([Transfer, Bank])],
  controllers: [TransfersController],
  providers: [TransfersService],
})
export class TransfersModule {}
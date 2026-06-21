import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TreasuryService } from './treasury.service';
import { TreasuryController } from './treasury.controller';
import { Bank } from '../banks/entities/bank.entity';
import { Movement } from '../movements/entities/movement.entity';
import { PaymentSchedule } from './entities/payment-schedule.entity';
import { Purchase } from '../purchases/entities/purchase.entity';
import { Shift } from '../pos/entities/shift.entity';
import { Transfer } from '../transfers/entities/transfer.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Bank, Movement, PaymentSchedule, Purchase, Shift, Transfer])],
  controllers: [TreasuryController],
  providers: [TreasuryService],
  exports: [TreasuryService],
})
export class TreasuryModule {}

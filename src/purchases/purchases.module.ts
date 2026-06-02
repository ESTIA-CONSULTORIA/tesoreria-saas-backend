import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { Purchase } from './entities/purchase.entity';
import { MovementsModule } from '../movements/movements.module';
import { CostsModule } from '../costs/costs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PurchaseOrder, Purchase]),
    MovementsModule,
    CostsModule,
  ],
  controllers: [PurchasesController],
  providers: [PurchasesService],
  exports: [PurchasesService],
})
export class PurchasesModule {}

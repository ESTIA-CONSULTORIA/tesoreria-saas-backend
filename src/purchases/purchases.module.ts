import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Purchase } from './entities/purchase.entity';
import { PurchaseItem } from './entities/purchase-item.entity';
import { Supplier } from './entities/supplier.entity';
import { PurchasesController } from './controllers/purchases.controller';
import { PurchaseFlowService } from './services/purchase-flow.service';
import { PurchaseFinancialService } from './services/purchase-financial.service';
import { PurchaseInventoryService } from './services/purchase-inventory.service';

@Module({
  imports: [TypeOrmModule.forFeature([Purchase, PurchaseItem, Supplier])],
  controllers: [PurchasesController],
  providers: [
    PurchaseFlowService,
    PurchaseFinancialService,
    PurchaseInventoryService,
  ],
  exports: [
    PurchaseFlowService,
    PurchaseFinancialService,
    PurchaseInventoryService,
  ],
})
export class PurchasesModule {}

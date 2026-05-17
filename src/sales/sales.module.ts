import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Sale } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { SalesFlowController } from './controllers/sales.controller';
import { SalesFinancialService } from './services/sales-financial.service';
import { SalesReportingService } from './services/sales-reporting.service';
import { SalesFlowService } from './services/sales-flow.service';
import { InventoryModule } from '../inventory/inventory.module';
import { AccountingModule } from '../accounting/accounting.module';
import { TreasuryModule } from '../treasury/treasury.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sale, SaleItem]),
    InventoryModule,
    AccountingModule,
    TreasuryModule,
    RealtimeModule,
  ],
  providers: [
    SalesService,
    SalesFlowService,
    SalesFinancialService,
    SalesReportingService,
  ],
  controllers: [
    SalesController,
    SalesFlowController,
  ],
  exports: [
    SalesService,
    SalesFlowService,
  ],
})
export class SalesModule {}

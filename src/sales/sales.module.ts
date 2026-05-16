import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Sale } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { SalesFinancialService } from './services/sales-financial.service';
import { SalesReportingService } from './services/sales-reporting.service';

@Module({
  imports: [TypeOrmModule.forFeature([Sale, SaleItem])],
  providers: [
    SalesService,
    SalesFinancialService,
    SalesReportingService,
  ],
  controllers: [SalesController],
  exports: [SalesService],
})
export class SalesModule {}

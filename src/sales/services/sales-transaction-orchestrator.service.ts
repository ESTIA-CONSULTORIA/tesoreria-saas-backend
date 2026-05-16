import { Injectable } from '@nestjs/common';

import { Sale } from '../entities/sale.entity';
import { SaleItem } from '../entities/sale-item.entity';
import { InventoryService } from '../../inventory/inventory.service';
import { PostingEngineService } from '../../accounting/services/posting-engine.service';
import { SalesFinancialService } from './sales-financial.service';
import { SalesReportingService } from './sales-reporting.service';

@Injectable()
export class SalesTransactionOrchestratorService {
  constructor(
    private inventoryService: InventoryService,
    private postingEngineService: PostingEngineService,
    private salesFinancialService: SalesFinancialService,
    private salesReportingService: SalesReportingService,
  ) {}

  async processSale(payload: {
    sale: Sale;
    items: SaleItem[];
  }) {
    const { sale, items } = payload;

    for (const item of items) {
      await this.inventoryService.registerMovement({
        tenantId: sale.tenantId,
        companyId: sale.companyId,
        branchId: sale.branchId,
        productId: item.productId,
        type: 'SALE',
        quantity: Number(item.quantity || 0),
        referenceType: 'SALE',
        referenceId: sale.id,
        notes: `Sale consumption for ${sale.id}`,
      });
    }

    await this.salesFinancialService.generateTreasuryMovement({
      saleId: sale.id,
      tenantId: sale.tenantId,
      companyId: sale.companyId,
      branchId: sale.branchId,
      total: Number(sale.total || 0),
      currency: sale.currency,
    });

    await this.postingEngineService.postSale({
      saleId: sale.id,
      total: Number(sale.total || 0),
      taxes: Number(sale.taxes || 0),
    });

    await this.salesReportingService.generateKpis({
      saleId: sale.id,
      total: Number(sale.total || 0),
      subtotal: Number(sale.subtotal || 0),
      taxes: Number(sale.taxes || 0),
      discounts: Number(sale.discounts || 0),
      branchId: sale.branchId,
      companyId: sale.companyId,
      tenantId: sale.tenantId,
    });

    return {
      success: true,
      saleId: sale.id,
      processedItems: items.length,
    };
  }
}

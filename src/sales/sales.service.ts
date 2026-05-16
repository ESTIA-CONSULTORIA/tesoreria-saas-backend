import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Sale } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { SalesFinancialService } from './services/sales-financial.service';
import { SalesReportingService } from './services/sales-reporting.service';

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(Sale)
    private salesRepository: Repository<Sale>,

    @InjectRepository(SaleItem)
    private saleItemsRepository: Repository<SaleItem>,

    private salesFinancialService: SalesFinancialService,
    private salesReportingService: SalesReportingService,
  ) {}

  async createSale(data: Partial<Sale> & { items?: Partial<SaleItem>[] }) {
    const sale = this.salesRepository.create(data);
    const savedSale = await this.salesRepository.save(sale);

    if (data.items?.length) {
      const items = data.items.map((item) =>
        this.saleItemsRepository.create({
          ...item,
          saleId: savedSale.id,
        }),
      );

      await this.saleItemsRepository.save(items);
    }

    await this.salesFinancialService.generateTreasuryMovement({
      saleId: savedSale.id,
      tenantId: savedSale.tenantId,
      companyId: savedSale.companyId,
      branchId: savedSale.branchId,
      total: Number(savedSale.total || 0),
      currency: savedSale.currency,
    });

    await this.salesReportingService.generateKpis({
      saleId: savedSale.id,
      total: Number(savedSale.total || 0),
      subtotal: Number(savedSale.subtotal || 0),
      taxes: Number(savedSale.taxes || 0),
      discounts: Number(savedSale.discounts || 0),
      branchId: savedSale.branchId,
      companyId: savedSale.companyId,
      tenantId: savedSale.tenantId,
    });

    return this.findSale(savedSale.id);
  }

  async findSale(id: string) {
    const sale = await this.salesRepository.findOne({
      where: { id },
    });

    const items = await this.saleItemsRepository.find({
      where: { saleId: id },
    });

    return {
      ...sale,
      items,
    };
  }

  findRecentSales() {
    return this.salesRepository.find({
      order: {
        createdAt: 'DESC',
      },
      take: 100,
    });
  }
}

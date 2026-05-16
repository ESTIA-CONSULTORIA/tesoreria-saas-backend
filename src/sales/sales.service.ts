import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Sale } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(Sale)
    private salesRepository: Repository<Sale>,

    @InjectRepository(SaleItem)
    private saleItemsRepository: Repository<SaleItem>,
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

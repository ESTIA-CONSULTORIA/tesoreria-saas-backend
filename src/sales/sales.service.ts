import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  Repository,
} from 'typeorm';

import { InventoryService } from '../inventory/inventory.service';
import { SaleItem } from './entities/sale-item.entity';
import { Sale } from './entities/sale.entity';
import { SalesFinancialService } from './services/sales-financial.service';
import { SalesReportingService } from './services/sales-reporting.service';

@Injectable()
export class SalesService {
  private readonly logger = new Logger(
    SalesService.name,
  );

  constructor(
    @InjectRepository(Sale)
    private salesRepository: Repository<Sale>,

    @InjectRepository(SaleItem)
    private saleItemsRepository: Repository<SaleItem>,

    private salesFinancialService: SalesFinancialService,
    private salesReportingService: SalesReportingService,
    private inventoryService: InventoryService,
    private dataSource: DataSource,
  ) {}

  async createSale(
    data: Partial<Sale> & {
      items?: Partial<SaleItem>[];
    },
  ) {
    if (!data.items?.length) {
      throw new BadRequestException(
        'La venta requiere al menos un item',
      );
    }

    const calculatedTotal = data.items.reduce(
      (acc, item) => {
        return (
          acc +
          Number(item.quantity || 0) *
            Number(item.unitPrice || 0)
        );
      },
      0,
    );

    const incomingTotal = Number(data.total || 0);

    if (incomingTotal <= 0) {
      throw new BadRequestException(
        'Total inválido',
      );
    }

    if (
      Math.abs(calculatedTotal - incomingTotal) > 0.01
    ) {
      throw new BadRequestException(
        'El total no coincide con los items',
      );
    }

    const queryRunner =
      this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const sale = queryRunner.manager.create(Sale, {
        ...data,
        total: incomingTotal,
      });

      const persistedSale = await queryRunner.manager.save(
        sale,
      );

      const items = data.items!.map((item) =>
        queryRunner.manager.create(SaleItem, {
          ...item,
          saleId: persistedSale.id,
        }),
      );

      await queryRunner.manager.save(items);

      for (const item of data.items) {
        if (!item.productId) {
          continue;
        }

        await this.inventoryService.registerMovement({
          productId: item.productId,
          quantity: Number(item.quantity || 0),
          type: 'SALE',
          referenceId: persistedSale.id,
        });
      }

      await this.salesFinancialService.generateTreasuryMovement({
        saleId: persistedSale.id,
        tenantId: persistedSale.tenantId,
        companyId: persistedSale.companyId,
        branchId: persistedSale.branchId,
        total: Number(persistedSale.total || 0),
        currency: persistedSale.currency,
      });

      await this.salesReportingService.generateKpis({
        saleId: persistedSale.id,
        total: Number(persistedSale.total || 0),
        subtotal: Number(
          persistedSale.subtotal || 0,
        ),
        taxes: Number(persistedSale.taxes || 0),
        discounts: Number(
          persistedSale.discounts || 0,
        ),
        branchId: persistedSale.branchId,
        companyId: persistedSale.companyId,
        tenantId: persistedSale.tenantId,
      });

      await queryRunner.commitTransaction();

      this.logger.log(
        `Venta creada correctamente: ${persistedSale.id}`,
      );

      return this.findSale(persistedSale.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();

      this.logger.error(
        'Error creando venta',
        error instanceof Error ? error.stack : undefined,
      );

      throw new InternalServerErrorException(
        'No fue posible completar la venta',
      );
    } finally {
      await queryRunner.release();
    }
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

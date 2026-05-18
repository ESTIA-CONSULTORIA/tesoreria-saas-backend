import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  Repository,
} from 'typeorm';

import { InventoryMovement } from './entities/inventory-movement.entity';
import { Product } from './entities/product.entity';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,

    @InjectRepository(InventoryMovement)
    private inventoryMovementsRepository: Repository<InventoryMovement>,

    private dataSource: DataSource,
  ) {}

  async createProduct(data: Partial<Product>) {
    const existingProduct = await this.productsRepository.findOne({
      where: {
        name: data.name,
      },
    });

    if (existingProduct) {
      throw new BadRequestException(
        'Ya existe un producto con ese nombre',
      );
    }

    const product = this.productsRepository.create({
      ...data,
      stock: Number(data.stock || 0),
    });

    return this.productsRepository.save(product);
  }

  findProducts() {
    return this.productsRepository.find({
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async registerMovement(data: Partial<InventoryMovement>) {
    return this.dataSource.transaction(async (manager) => {
      const product = await manager.findOne(Product, {
        where: {
          id: data.productId,
        },
      });

      if (!product) {
        throw new BadRequestException(
          'Producto no encontrado',
        );
      }

      const movementType = String(
        data.type || '',
      ).toUpperCase();

      const allowedTypes = [
        'IN',
        'OUT',
        'SALE',
        'ADJUSTMENT',
      ];

      if (!allowedTypes.includes(movementType)) {
        throw new BadRequestException(
          'Tipo de movimiento inválido',
        );
      }

      const quantity = Number(data.quantity || 0);

      if (quantity <= 0) {
        throw new BadRequestException(
          'Cantidad inválida',
        );
      }

      const previousStock = Number(product.stock || 0);

      let newStock = previousStock;

      if (['OUT', 'SALE'].includes(movementType)) {
        if (previousStock < quantity) {
          throw new BadRequestException(
            'Stock insuficiente',
          );
        }

        newStock -= quantity;
      } else {
        newStock += quantity;
      }

      product.stock = newStock;

      await manager.save(product);

      const movement = manager.create(
        InventoryMovement,
        {
          ...data,
          type: movementType,
          quantity,
          previousStock,
          newStock,
        },
      );

      return manager.save(movement);
    });
  }
}

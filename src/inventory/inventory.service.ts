import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Product } from './entities/product.entity';
import { InventoryMovement } from './entities/inventory-movement.entity';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,

    @InjectRepository(InventoryMovement)
    private inventoryMovementsRepository: Repository<InventoryMovement>,
  ) {}

  createProduct(data: Partial<Product>) {
    const product = this.productsRepository.create(data);
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
    const product = await this.productsRepository.findOne({
      where: {
        id: data.productId,
      },
    });

    if (!product) {
      throw new Error('Product not found');
    }

    const previousStock = Number(product.stock || 0);

    let newStock = previousStock;

    if (['OUT', 'SALE'].includes(data.type || '')) {
      newStock -= Number(data.quantity || 0);
    } else {
      newStock += Number(data.quantity || 0);
    }

    await this.productsRepository.update(product.id, {
      stock: newStock,
    });

    const movement = this.inventoryMovementsRepository.create({
      ...data,
      previousStock,
      newStock,
    });

    return this.inventoryMovementsRepository.save(movement);
  }
}

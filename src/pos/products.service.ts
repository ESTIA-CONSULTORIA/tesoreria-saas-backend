import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private productsRepo: Repository<Product>,
  ) {}

  findAll(branchId?: string) {
    return this.productsRepo.find({
      where: branchId ? { branchId } : undefined,
      order: { name: 'ASC' },
    });
  }

  findOne(id: string) {
    return this.productsRepo.findOne({ where: { id } });
  }

  create(data: Partial<Product>) {
    const product = this.productsRepo.create(data);
    return this.productsRepo.save(product);
  }

  async update(id: string, data: Partial<Product>) {
    await this.productsRepo.update(id, { ...data, updatedAt: new Date() });
    return this.productsRepo.findOne({ where: { id } });
  }

  async delete(id: string) {
    await this.productsRepo.delete(id);
  }
}

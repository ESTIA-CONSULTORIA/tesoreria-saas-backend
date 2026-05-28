import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './entities/category.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private categoriesRepo: Repository<Category>,
  ) {}

  findAll(branchId?: string) {
    return this.categoriesRepo.find({
      where: branchId ? { branchId } : undefined,
      order: { order: 'ASC', name: 'ASC' },
    });
  }

  findOne(id: string) {
    return this.categoriesRepo.findOne({ where: { id } });
  }

  create(data: Partial<Category>) {
    const category = this.categoriesRepo.create(data);
    return this.categoriesRepo.save(category);
  }

  async update(id: string, data: Partial<Category>) {
    await this.categoriesRepo.update(id, { ...data, updatedAt: new Date() });
    return this.categoriesRepo.findOne({ where: { id } });
  }

  async delete(id: string) {
    await this.categoriesRepo.delete(id);
  }
}

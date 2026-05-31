import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PosCategory } from './entities/category.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(PosCategory)
    private categoriesRepo: Repository<PosCategory>,
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

  create(data: Partial<PosCategory>) {
    const category = this.categoriesRepo.create(data);
    return this.categoriesRepo.save(category);
  }

  async update(id: string, data: Partial<PosCategory>) {
    await this.categoriesRepo.update(id, { ...data, updatedAt: new Date() });
    return this.categoriesRepo.findOne({ where: { id } });
  }

  async delete(id: string) {
    await this.categoriesRepo.delete(id);
  }
}

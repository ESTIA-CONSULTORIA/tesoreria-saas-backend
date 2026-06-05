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

  async findAll(branchId?: string) {
    const query = this.categoriesRepo.createQueryBuilder('category');
    
    if (branchId) {
      query.andWhere('category.branchId = :branchId', { branchId });
    }
    
    // Subquery para contar productos por categoría
    query.loadRelationCountAndMap('category.productCount', 'category.products', 'product');
    
    query.orderBy('category.order', 'ASC').addOrderBy('category.name', 'ASC');
    
    return query.getMany();
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

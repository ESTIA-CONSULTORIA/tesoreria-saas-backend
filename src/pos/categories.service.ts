import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PosCategory } from './entities/category.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Company } from '../companies/entities/company.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(PosCategory)
    private categoriesRepo: Repository<PosCategory>,
    @InjectRepository(Branch)
    private branchesRepo: Repository<Branch>,
    @InjectRepository(Company)
    private companiesRepo: Repository<Company>,
  ) {}

  // Auditoría BUSINESS (hallazgo transversal #6, continuación): PosCategory no tiene
  // tenantId propio — la pertenencia se resuelve vía branchId → Branch → Company.tenantId,
  // mismo patrón de dos saltos que branches.service.ts::findOwnedBranch(). Opcional para no
  // romper a SOPORTE.
  private async findOwnedCategory(id: string, tenantId?: string): Promise<PosCategory | null> {
    const category = await this.categoriesRepo.findOne({ where: { id } });
    if (!category) return null;
    if (!tenantId) return category;
    if (!category.branchId) return null;
    const branch = await this.branchesRepo.findOne({ where: { id: category.branchId } });
    if (!branch) return null;
    const company = await this.companiesRepo.findOne({ where: { id: branch.companyId, tenantId } });
    if (!company) return null;
    return category;
  }

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

  findOne(id: string, tenantId?: string) {
    return this.findOwnedCategory(id, tenantId);
  }

  create(data: Partial<PosCategory>) {
    const category = this.categoriesRepo.create(data);
    return this.categoriesRepo.save(category);
  }

  async update(id: string, data: Partial<PosCategory>, tenantId?: string) {
    const existing = await this.findOwnedCategory(id, tenantId);
    if (!existing) throw new NotFoundException('Categoría no encontrada');
    await this.categoriesRepo.update(id, { ...data, updatedAt: new Date() });
    return this.categoriesRepo.findOne({ where: { id } });
  }

  async delete(id: string, tenantId?: string) {
    const existing = await this.findOwnedCategory(id, tenantId);
    if (!existing) throw new NotFoundException('Categoría no encontrada');
    await this.categoriesRepo.delete(id);
    return { deleted: true };
  }
}

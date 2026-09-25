import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Area } from './entities/area.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Company } from '../companies/entities/company.entity';

@Injectable()
export class AreasService {
  constructor(
    @InjectRepository(Area)
    private areasRepo: Repository<Area>,
    @InjectRepository(Branch)
    private branchesRepo: Repository<Branch>,
    @InjectRepository(Company)
    private companiesRepo: Repository<Company>,
  ) {}

  // Auditoría BUSINESS (hallazgo transversal #6, continuación): Area no tiene tenantId
  // propio — la pertenencia se resuelve vía branchId → Branch → Company.tenantId, mismo
  // patrón de dos saltos que branches.service.ts::findOwnedBranch(). Opcional para no romper
  // a SOPORTE.
  private async findOwnedArea(id: string, tenantId?: string): Promise<Area | null> {
    const area = await this.areasRepo.findOne({ where: { id } });
    if (!area) return null;
    if (!tenantId) return area;
    if (!area.branchId) return null;
    const branch = await this.branchesRepo.findOne({ where: { id: area.branchId } });
    if (!branch) return null;
    const company = await this.companiesRepo.findOne({ where: { id: branch.companyId, tenantId } });
    if (!company) return null;
    return area;
  }

  findAll(branchId?: string) {
    return this.areasRepo.find({
      where: branchId ? { branchId } : undefined,
      relations: ['tables'],
      order: { name: 'ASC' },
    });
  }

  findOne(id: string, tenantId?: string) {
    return this.findOwnedArea(id, tenantId);
  }

  create(data: Partial<Area>) {
    const area = this.areasRepo.create(data);
    return this.areasRepo.save(area);
  }

  async update(id: string, data: Partial<Area>, tenantId?: string) {
    const existing = await this.findOwnedArea(id, tenantId);
    if (!existing) throw new NotFoundException('Área no encontrada');
    await this.areasRepo.update(id, { ...data, updatedAt: new Date() });
    return this.areasRepo.findOne({ where: { id } });
  }

  async delete(id: string, tenantId?: string) {
    const existing = await this.findOwnedArea(id, tenantId);
    if (!existing) throw new NotFoundException('Área no encontrada');
    await this.areasRepo.delete(id);
    return { deleted: true };
  }
}

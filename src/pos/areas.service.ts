import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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

  // Sucursales del tenant (Branch → Company.tenantId).
  private async branchIdsDelTenant(tenantId: string): Promise<string[]> {
    const companies = await this.companiesRepo.find({ where: { tenantId } });
    if (!companies.length) return [];
    const branches = await this.branchesRepo.find({ where: { companyId: In(companies.map((c) => c.id)) } });
    return branches.map((b) => b.id);
  }

  // Con tenantId SIEMPRE filtra por las sucursales del tenant, venga o no sucursal en la petición:
  // antes, sin sucursal (token POS Lite, ADMIN sin sucursal) devolvía las áreas CON SUS MESAS de todos
  // los tenants. Una sucursal pedida que no es del tenant devuelve vacío, no la ajena. Sin tenantId
  // (SOPORTE) conserva el comportamiento anterior.
  async findAll(branchId?: string, tenantId?: string) {
    if (!tenantId) {
      return this.areasRepo.find({
        where: branchId ? { branchId } : undefined,
        relations: ['tables'],
        order: { name: 'ASC' },
      });
    }
    const propias = await this.branchIdsDelTenant(tenantId);
    const ids = branchId ? propias.filter((b) => b === branchId) : propias;
    if (!ids.length) return [];
    const areas = await this.areasRepo.find({
      where: { branchId: In(ids) },
      relations: ['tables'],
      order: { name: 'ASC' },
    });
    // Una mesa de otro tenant que apunte a un área de este (dato viejo o malicioso) no se muestra.
    return areas.map((a) => ({ ...a, tables: (a.tables || []).filter((t) => t.tenantId === tenantId) }));
  }

  // Sucursal que debe pertenecer al tenant (alta/edición de áreas y mesas).
  async assertBranchOwned(branchId: string | undefined, tenantId?: string): Promise<void> {
    if (!tenantId) return;
    if (!branchId || !(await this.branchIdsDelTenant(tenantId)).includes(branchId)) {
      throw new BadRequestException('Sucursal no encontrada.');
    }
  }

  // Área que debe pertenecer al tenant (alta/edición de mesas).
  async assertAreaOwned(areaId: string | undefined, tenantId?: string): Promise<void> {
    if (!tenantId) return;
    if (!areaId || !(await this.findOwnedArea(areaId, tenantId))) {
      throw new BadRequestException('Área no encontrada.');
    }
  }

  findOne(id: string, tenantId?: string) {
    return this.findOwnedArea(id, tenantId);
  }

  async create(data: Partial<Area>, tenantId?: string) {
    await this.assertBranchOwned(data.branchId, tenantId);
    const area = this.areasRepo.create(data);
    return this.areasRepo.save(area);
  }

  async update(id: string, data: Partial<Area>, tenantId?: string) {
    const existing = await this.findOwnedArea(id, tenantId);
    if (!existing) throw new NotFoundException('Área no encontrada');
    if (data.branchId !== undefined) await this.assertBranchOwned(data.branchId, tenantId);
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

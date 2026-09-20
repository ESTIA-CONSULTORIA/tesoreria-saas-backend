import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Branch } from './entities/branch.entity';
import { Company } from '../companies/entities/company.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { Repository, In } from 'typeorm';

@Injectable()
export class BranchesService {
  constructor(
    @InjectRepository(Branch)
    private branchesRepository: Repository<Branch>,
    @InjectRepository(Company)
    private companiesRepository: Repository<Company>,
    @InjectRepository(Tenant)
    private tenantRepo: Repository<Tenant>,
  ) {}

  async create(
    companyId: string,
    code: string,
    name: string,
    address?: string,
    city?: string,
    state?: string,
    tenantId?: string,
  ) {
    const company = await this.companiesRepository.findOne({ where: { id: companyId } });

    // Auditoría BUSINESS (hallazgo #2, transversal #6): antes no se verificaba que companyId
    // fuera una empresa del tenant que crea la sucursal — cualquier tenant con 'sucursales'
    // activo podía colgar una sucursal de la empresa de OTRO tenant con solo mandar su id.
    // Opcional para no romper a SOPORTE (tenantId null en su JWT).
    if (tenantId && (!company || company.tenantId !== tenantId)) {
      throw new BadRequestException('Empresa no encontrada');
    }

    if (company) {
      const tenant = await this.tenantRepo.findOne({ where: { id: company.tenantId } });
      if (tenant?.plan?.startsWith('LITE')) {
        const siblings = await this.companiesRepository.find({ where: { tenantId: company.tenantId }, select: ['id'] });
        const companyIds = siblings.map(c => c.id);
        const count = await this.branchesRepository.count({ where: { companyId: In(companyIds) } });
        if (count >= 1) {
          throw new BadRequestException('El plan LITE permite máximo 1 sucursal');
        }
      }
    }

    const branch = this.branchesRepository.create({
      companyId,
      code,
      name,
      address,
      city,
      state,
      isActive: true,
    });

    return this.branchesRepository.save(branch);
  }

  findAll() {
    return this.branchesRepository.find();
  }

  // Auditoría BUSINESS (hallazgo #2, transversal #6): GET /branches/company/:companyId no
  // tenía guard de pertenencia — cualquier usuario autenticado podía listar las sucursales de
  // una empresa ajena solo sabiendo su companyId.
  async findByCompany(companyId: string, tenantId?: string) {
    if (tenantId) {
      const company = await this.companiesRepository.findOne({ where: { id: companyId, tenantId } });
      if (!company) throw new NotFoundException('Empresa no encontrada');
    }
    return this.branchesRepository.find({
      where: { companyId },
    });
  }

  async findByTenant(tenantId: string) {
    // Buscar companyIds del tenant
    const companies = await this.companiesRepository.find({
      where: { tenantId },
      select: ['id']
    });

    if (!companies.length) return [];

    const companyIds = companies.map(c => c.id);

    // Buscar sucursales de esas empresas
    return this.branchesRepository
      .createQueryBuilder('branch')
      .where('branch.companyId IN (:...companyIds)', { companyIds })
      .getMany();
  }

  // Branch no tiene columna tenantId propia — la pertenencia se resuelve siempre a través de
  // la empresa (companyId → Company.tenantId), igual que hace movements.service.ts vía Bank.
  // Mismo mensaje que "no encontrada" a propósito para no revelar si el id existe en otro tenant.
  private async findOwnedBranch(id: string, tenantId?: string) {
    const branch = await this.branchesRepository.findOne({ where: { id } });
    if (!branch) return null;
    if (!tenantId) return branch; // SOPORTE (tenantId null en su JWT) conserva acceso total.
    const company = await this.companiesRepository.findOne({ where: { id: branch.companyId } });
    if (!company || company.tenantId !== tenantId) return null;
    return branch;
  }

  // Auditoría BUSINESS (hallazgo #2, transversal #6): update()/remove() no filtraban por
  // tenant/empresa en absoluto — cualquier usuario autenticado podía editar o borrar la
  // sucursal de OTRO tenant conociendo su id.
  async update(
    id: string,
    data: { companyId?: string; code?: string; name?: string; address?: string; city?: string; state?: string; isActive?: boolean },
    tenantId?: string,
  ) {
    const existing = await this.findOwnedBranch(id, tenantId);
    if (!existing) {
      throw new NotFoundException('Sucursal no encontrada');
    }
    await this.branchesRepository.update(id, data);
    return this.branchesRepository.findOne({ where: { id } });
  }

  async remove(id: string, tenantId?: string) {
    const existing = await this.findOwnedBranch(id, tenantId);
    if (!existing) {
      throw new NotFoundException('Sucursal no encontrada');
    }
    await this.branchesRepository.delete(id);
    return { deleted: true };
  }
}
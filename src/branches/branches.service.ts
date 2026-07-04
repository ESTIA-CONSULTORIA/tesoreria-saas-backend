import { Injectable, BadRequestException } from '@nestjs/common';
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
  ) {
    const company = await this.companiesRepository.findOne({ where: { id: companyId } });
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

  findByCompany(companyId: string) {
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

  async update(id: string, data: { companyId?: string; code?: string; name?: string; address?: string; city?: string; state?: string; isActive?: boolean }) {
    await this.branchesRepository.update(id, data);
    return this.branchesRepository.findOne({ where: { id } });
  }

  async remove(id: string) {
    await this.branchesRepository.delete(id);
  }
}
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Company } from './entities/company.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { Repository } from 'typeorm';

@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(Company)
    private companiesRepository: Repository<Company>,
    @InjectRepository(Tenant)
    private tenantRepo: Repository<Tenant>,
  ) {}

  async create(
    tenantId: string,
    legalName: string,
    tradeName: string,
    taxId?: string,
    baseCurrency?: string,
  ) {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (tenant?.plan?.startsWith('LITE')) {
      const count = await this.companiesRepository.count({ where: { tenantId } });
      if (count >= 1) {
        throw new BadRequestException('El plan LITE permite máximo 1 empresa');
      }
    }

    const company = this.companiesRepository.create({
      tenantId,
      legalName,
      tradeName,
      taxId,
      baseCurrency: baseCurrency || 'MXN',
      isActive: true,
    });

    return this.companiesRepository.save(company);
  }

  findAll() {
    return this.companiesRepository.find();
  }

  findByTenant(tenantId: string) {
    return this.companiesRepository.find({
      where: { tenantId },
    });
  }

  async update(id: string, data: { legalName?: string; tradeName?: string; taxId?: string; baseCurrency?: string; isActive?: boolean }) {
    await this.companiesRepository.update(id, data);
    return this.companiesRepository.findOne({ where: { id } });
  }

  async remove(id: string) {
    await this.companiesRepository.delete(id);
  }

  async findOne(id: string) {
    return this.companiesRepository.findOne({ where: { id } });
  }
}
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Company } from './entities/company.entity';
import { Repository } from 'typeorm';

@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(Company)
    private companiesRepository: Repository<Company>,
  ) {}

  create(
    tenantId: string,
    legalName: string,
    tradeName: string,
    taxId?: string,
    baseCurrency?: string,
  ) {
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
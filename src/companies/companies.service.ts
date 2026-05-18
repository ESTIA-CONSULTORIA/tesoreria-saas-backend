import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Company } from './entities/company.entity';

@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(Company)
    private companiesRepository: Repository<Company>,
  ) {}

  async create(
    tenantId: string,
    legalName: string,
    tradeName: string,
    taxId?: string,
    baseCurrency?: string,
  ) {
    const normalizedTenantId = String(
      tenantId || '',
    ).trim();

    const normalizedLegalName = String(
      legalName || '',
    ).trim();

    const normalizedTradeName = String(
      tradeName || '',
    ).trim();

    const normalizedTaxId = String(
      taxId || '',
    )
      .trim()
      .toUpperCase();

    const normalizedCurrency = String(
      baseCurrency || 'MXN',
    )
      .trim()
      .toUpperCase();

    if (!normalizedTenantId) {
      throw new BadRequestException(
        'tenantId requerido',
      );
    }

    const existingCompany = await this.companiesRepository.findOne({
      where: {
        tenantId: normalizedTenantId,
        tradeName: normalizedTradeName,
      },
    });

    if (existingCompany) {
      throw new BadRequestException(
        'La empresa ya existe',
      );
    }

    const company = this.companiesRepository.create({
      tenantId: normalizedTenantId,
      legalName: normalizedLegalName,
      tradeName: normalizedTradeName,
      taxId: normalizedTaxId || null,
      baseCurrency: normalizedCurrency,
      isActive: true,
    });

    return this.companiesRepository.save(company);
  }

  findAll() {
    return this.companiesRepository.find({
      order: {
        createdAt: 'DESC',
      },
    });
  }

  findByTenant(tenantId: string) {
    return this.companiesRepository.find({
      where: {
        tenantId: String(tenantId || '').trim(),
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }
}

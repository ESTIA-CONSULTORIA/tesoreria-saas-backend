import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
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

  // Auditoría BUSINESS (hallazgo #2, transversal #6): update()/remove()/findOne() no
  // filtraban por tenant en absoluto — cualquier usuario autenticado de cualquier tenant que
  // conociera el id de una empresa ajena podía leerla, editarla o borrarla. Mismo criterio
  // que banks.service.ts::findOne(id, tenantId) — opcional para no romper a SOPORTE
  // (tenantId null en su JWT).
  async update(
    id: string,
    data: { legalName?: string; tradeName?: string; taxId?: string; baseCurrency?: string; isActive?: boolean },
    tenantId?: string,
  ) {
    const existing = await this.findOne(id, tenantId);
    if (!existing) {
      throw new NotFoundException('Empresa no encontrada');
    }
    await this.companiesRepository.update(id, data);
    return this.findOne(id, tenantId);
  }

  async remove(id: string, tenantId?: string) {
    const existing = await this.findOne(id, tenantId);
    if (!existing) {
      throw new NotFoundException('Empresa no encontrada');
    }
    await this.companiesRepository.delete(id);
    return { deleted: true };
  }

  async findOne(id: string, tenantId?: string) {
    return this.companiesRepository.findOne({
      where: tenantId ? { id, tenantId } : { id },
    });
  }
}
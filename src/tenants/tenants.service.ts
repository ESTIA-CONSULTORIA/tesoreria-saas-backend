import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity';
import { Repository } from 'typeorm';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private tenantsRepository: Repository<Tenant>,
  ) {}

  create(legalName: string, tradeName: string, taxId?: string, plan?: string) {
    const tenant = this.tenantsRepository.create({
      legalName,
      tradeName,
      taxId,
      plan: plan || 'BASIC',
      isActive: true,
    });

    return this.tenantsRepository.save(tenant);
  }

  findAll() {
    return this.tenantsRepository.find();
  }

  findOne(id: string) {
    return this.tenantsRepository.findOne({ where: { id } });
  }

  async updatePlan(id: string, plan: string) {
    await this.tenantsRepository.update(id, { plan });
    return this.tenantsRepository.findOne({ where: { id } });
  }

  async markOnboarded(id: string) {
    await this.tenantsRepository.update(id, { isOnboarded: true });
    return this.tenantsRepository.findOne({ where: { id } });
  }
}
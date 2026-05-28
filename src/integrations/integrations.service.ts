import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Integration } from './entities/integration.entity';

@Injectable()
export class IntegrationsService {
  constructor(
    @InjectRepository(Integration)
    private integrationsRepository: Repository<Integration>,
  ) {}

  create(data: Partial<Integration>) {
    const integration = this.integrationsRepository.create(data);
    return this.integrationsRepository.save(integration);
  }

  findAll() {
    return this.integrationsRepository.find();
  }

  findByCompany(companyId: string) {
    return this.integrationsRepository.find({
      where: { companyId },
    });
  }
}
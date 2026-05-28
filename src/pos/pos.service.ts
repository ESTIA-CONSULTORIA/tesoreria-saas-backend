import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PosConfig } from './entities/pos-config.entity';

@Injectable()
export class PosService {
  constructor(
    @InjectRepository(PosConfig)
    private posConfigRepo: Repository<PosConfig>,
  ) {}

  async findByBranch(branchId: string) {
    return this.posConfigRepo.findOne({ where: { branchId } });
  }

  async create(data: Partial<PosConfig>) {
    const config = this.posConfigRepo.create(data);
    return this.posConfigRepo.save(config);
  }

  async update(id: string, data: Partial<PosConfig>) {
    await this.posConfigRepo.update(id, { ...data, updatedAt: new Date() });
    return this.posConfigRepo.findOne({ where: { id } });
  }

  async upsertByBranch(branchId: string, data: Partial<PosConfig>) {
    const existing = await this.findByBranch(branchId);
    if (existing) {
      return this.update(existing.id, data);
    }
    return this.create({ ...data, branchId });
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AddonSubscription } from './entities/addon-subscription.entity';

@Injectable()
export class AddonsService {
  constructor(
    @InjectRepository(AddonSubscription)
    private addonsRepo: Repository<AddonSubscription>,
  ) {}

  findAll(tenantId?: string) {
    return this.addonsRepo.find({
      where: tenantId ? { tenantId } : undefined,
      order: { createdAt: 'DESC' },
    });
  }

  findOne(id: string) {
    return this.addonsRepo.findOne({ where: { id } });
  }

  create(data: Partial<AddonSubscription>) {
    const addon = this.addonsRepo.create(data);
    return this.addonsRepo.save(addon);
  }

  async update(id: string, data: Partial<AddonSubscription>) {
    await this.addonsRepo.update(id, data);
    return this.addonsRepo.findOne({ where: { id } });
  }

  async delete(id: string) {
    await this.addonsRepo.delete(id);
  }

  async getActiveModulesByTenant(tenantId: string): Promise<string[]> {
    const addons = await this.addonsRepo.find({
      where: { tenantId, status: 'ACTIVO' },
    });
    return addons.map(a => a.moduloNombre);
  }
}

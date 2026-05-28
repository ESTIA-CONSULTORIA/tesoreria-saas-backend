import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Supplier } from './entities/supplier.entity';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private suppliersRepo: Repository<Supplier>,
  ) {}

  findAll(tenantId?: string) {
    return this.suppliersRepo.find({
      where: tenantId ? { tenantId } : undefined,
      order: { nombre: 'ASC' },
    });
  }

  findOne(id: string) {
    return this.suppliersRepo.findOne({ where: { id } });
  }

  create(data: Partial<Supplier>) {
    const supplier = this.suppliersRepo.create(data);
    return this.suppliersRepo.save(supplier);
  }

  async update(id: string, data: Partial<Supplier>) {
    await this.suppliersRepo.update(id, { ...data, updatedAt: new Date() });
    return this.suppliersRepo.findOne({ where: { id } });
  }

  async delete(id: string) {
    await this.suppliersRepo.delete(id);
  }
}

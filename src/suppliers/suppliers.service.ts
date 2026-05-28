import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Supplier } from './entities/supplier.entity';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private suppliersRepo: Repository<Supplier>,
  ) {}

  findAll(tenantId?: string, search?: string, isActive?: boolean) {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    if (isActive !== undefined) where.isActive = isActive;
    if (search) {
      where.nombre = Like(`%${search}%`);
    }

    return this.suppliersRepo.find({
      where,
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

  async softDelete(id: string) {
    await this.suppliersRepo.update(id, { isActive: false, updatedAt: new Date() });
  }

  async delete(id: string) {
    await this.suppliersRepo.delete(id);
  }
}

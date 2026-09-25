import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Table } from './entities/table.entity';

@Injectable()
export class TablesService {
  constructor(
    @InjectRepository(Table)
    private tablesRepo: Repository<Table>,
  ) {}

  findAll(branchId?: string, areaId?: string) {
    const where: any = {};
    if (branchId) where.branchId = branchId;
    if (areaId) where.areaId = areaId;
    
    return this.tablesRepo.find({
      where: Object.keys(where).length > 0 ? where : undefined,
      order: { number: 'ASC' },
    });
  }

  // Auditoría BUSINESS (hallazgo transversal #6, continuación): findOne()/update()/delete()
  // no verificaban que la mesa perteneciera al tenant de quien llama — Table sí tiene
  // tenantId propio, mismo patrón que banks.service.ts. Opcional para no romper a SOPORTE.
  findOne(id: string, tenantId?: string) {
    return this.tablesRepo.findOne({ where: tenantId ? { id, tenantId } : { id } });
  }

  create(data: Partial<Table>) {
    const table = this.tablesRepo.create(data);
    return this.tablesRepo.save(table);
  }

  async update(id: string, data: Partial<Table>, tenantId?: string) {
    if (tenantId) {
      const existing = await this.tablesRepo.findOne({ where: { id, tenantId } });
      if (!existing) throw new NotFoundException('Mesa no encontrada');
    }
    await this.tablesRepo.update(id, { ...data, updatedAt: new Date() });
    return this.tablesRepo.findOne({ where: { id } });
  }

  async delete(id: string, tenantId?: string) {
    if (tenantId) {
      const existing = await this.tablesRepo.findOne({ where: { id, tenantId } });
      if (!existing) throw new NotFoundException('Mesa no encontrada');
    }
    await this.tablesRepo.delete(id);
    return { deleted: true };
  }
}

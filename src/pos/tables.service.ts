import { Injectable } from '@nestjs/common';
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

  findOne(id: string) {
    return this.tablesRepo.findOne({ where: { id } });
  }

  create(data: Partial<Table>) {
    const table = this.tablesRepo.create(data);
    return this.tablesRepo.save(table);
  }

  async update(id: string, data: Partial<Table>) {
    await this.tablesRepo.update(id, { ...data, updatedAt: new Date() });
    return this.tablesRepo.findOne({ where: { id } });
  }

  async delete(id: string) {
    await this.tablesRepo.delete(id);
  }
}

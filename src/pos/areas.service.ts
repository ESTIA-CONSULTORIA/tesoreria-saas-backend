import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Area } from './entities/area.entity';

@Injectable()
export class AreasService {
  constructor(
    @InjectRepository(Area)
    private areasRepo: Repository<Area>,
  ) {}

  findAll(branchId?: string) {
    return this.areasRepo.find({
      where: branchId ? { branchId } : undefined,
      order: { name: 'ASC' },
    });
  }

  findOne(id: string) {
    return this.areasRepo.findOne({ where: { id } });
  }

  create(data: Partial<Area>) {
    const area = this.areasRepo.create(data);
    return this.areasRepo.save(area);
  }

  async update(id: string, data: Partial<Area>) {
    await this.areasRepo.update(id, { ...data, updatedAt: new Date() });
    return this.areasRepo.findOne({ where: { id } });
  }

  async delete(id: string) {
    await this.areasRepo.delete(id);
  }
}

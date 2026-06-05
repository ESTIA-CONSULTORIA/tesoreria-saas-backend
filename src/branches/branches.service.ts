import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Branch } from './entities/branch.entity';
import { Repository } from 'typeorm';

@Injectable()
export class BranchesService {
  constructor(
    @InjectRepository(Branch)
    private branchesRepository: Repository<Branch>,
  ) {}

  create(
    companyId: string,
    code: string,
    name: string,
    address?: string,
    city?: string,
    state?: string,
  ) {
    const branch = this.branchesRepository.create({
      companyId,
      code,
      name,
      address,
      city,
      state,
      isActive: true,
    });

    return this.branchesRepository.save(branch);
  }

  findAll() {
    return this.branchesRepository.find();
  }

  findByCompany(companyId: string) {
    return this.branchesRepository.find({
      where: { companyId },
    });
  }

  async update(id: string, data: { companyId?: string; code?: string; name?: string; address?: string; city?: string; state?: string; isActive?: boolean }) {
    await this.branchesRepository.update(id, data);
    return this.branchesRepository.findOne({ where: { id } });
  }

  async remove(id: string) {
    await this.branchesRepository.delete(id);
  }
}
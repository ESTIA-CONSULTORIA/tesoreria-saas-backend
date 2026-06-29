import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Tenant } from './entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { Company } from '../companies/entities/company.entity';
import { Branch } from '../branches/entities/branch.entity';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)  private tenantsRepository:   Repository<Tenant>,
    @InjectRepository(User)    private usersRepository:     Repository<User>,
    @InjectRepository(Company) private companiesRepository: Repository<Company>,
    @InjectRepository(Branch)  private branchesRepository:  Repository<Branch>,
  ) {}

  async create(
    legalName: string,
    tradeName: string,
    taxId?: string,
    plan?: string,
    email?: string,
    password?: string,
    ownerName?: string,
  ) {
    // 1. Tenant
    const tenant = await this.tenantsRepository.save(
      this.tenantsRepository.create({
        legalName,
        tradeName,
        taxId,
        plan: plan || 'BASIC',
        isActive: true,
      }),
    );

    // 2. Usuario ADMIN del tenant
    if (email && password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await this.usersRepository.save(
        this.usersRepository.create({
          email,
          password: hashedPassword,
          name: ownerName || legalName,
          roleCode: 'ADMIN',
          tenantId: tenant.id,
          isActive: true,
        }),
      );
    }

    // 3. Empresa principal
    const company = await this.companiesRepository.save(
      this.companiesRepository.create({
        legalName,
        tradeName: tradeName || legalName,
        tenantId: tenant.id,
        baseCurrency: 'MXN',
        isActive: true,
      }),
    );

    // 4. Sucursal Matriz
    await this.branchesRepository.save(
      this.branchesRepository.create({
        companyId: company.id,
        code: 'MATRIZ',
        name: 'Matriz',
        isActive: true,
      }),
    );

    return tenant;
  }

  findAll() {
    return this.tenantsRepository.find();
  }

  findOne(id: string) {
    return this.tenantsRepository.findOne({ where: { id } });
  }

  async update(id: string, data: Partial<{ legalName: string; tradeName: string; plan: string; isActive: boolean }>) {
    await this.tenantsRepository.update(id, data);
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

import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Account } from './entities/account.entity';
import { Repository } from 'typeorm';
import { assertSucursalLegible } from '../common/sucursal-efectiva';

// `tenantId` undefined = SOPORTE (sin acotar). Con tenantId, solo cuentas de sucursales de ese tenant.
@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private accountsRepository: Repository<Account>,
  ) {}

  async create(branchId: string, name: string, type: string, currency?: string, tenantId?: string) {
    if (!branchId) throw new BadRequestException('branchId es obligatorio');
    await assertSucursalLegible(this.accountsRepository.manager, branchId, tenantId);
    const account = this.accountsRepository.create({
      branchId,
      name,
      type,
      currency: currency || 'MXN',
      balance: 0,
      isActive: true,
    });

    return this.accountsRepository.save(account);
  }

  async findAll(tenantId?: string) {
    if (!tenantId) return this.accountsRepository.find();
    return this.accountsRepository.manager.query(
      `SELECT a.* FROM "account" a
         JOIN "branch" b ON b.id::text = a."branchId"::text
         JOIN "company" c ON c.id::text = b."companyId"::text
        WHERE c."tenantId"::text = $1::text`,
      [tenantId],
    );
  }

  async findByBranch(branchId: string, tenantId?: string) {
    await assertSucursalLegible(this.accountsRepository.manager, branchId, tenantId);
    return this.accountsRepository.find({ where: { branchId } });
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Bank } from './entities/bank.entity';
import { Repository, In } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class BanksService {
  constructor(
    @InjectRepository(Bank)
    private banksRepository: Repository<Bank>,
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  create(
    branchId: string,
    name: string,
    accountNumber: string,
    bank: string,
    initialBalance: number,
    currency: string,
    type: string,
    tenantId?: string,
  ) {
    const numericInitialBalance = Number(initialBalance || 0);

    const bankAccount = this.banksRepository.create({
      branchId,
      name,
      accountNumber,
      bank,
      initialBalance: numericInitialBalance,
      balance: numericInitialBalance,
      currency: currency || 'MXN',
      type,
      isActive: true,
      tenantId,
    });

    return this.banksRepository.save(bankAccount);
  }

  findAll() {
    return this.banksRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  findByTenant(tenantId: string) {
    return this.banksRepository.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  findByBranch(branchId: string) {
    return this.banksRepository.find({
      where: { branchId },
      order: { createdAt: 'DESC' },
    });
  }

  async findByCompany(companyId: string) {
    const branches = await this.dataSource
      .getRepository('Branch')
      .createQueryBuilder('branch')
      .where('branch.companyId::text = :companyId', { companyId })
      .getMany();

    const ids = branches.map(b => b.id);

    if (ids.length === 0) {
      return [];
    }

    return this.banksRepository.find({
      where: { branchId: In(ids) },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, tenantId?: string) {
    if (!UUID_RE.test(id)) {
      throw new NotFoundException(`Bank not found`);
    }
    return this.banksRepository.findOne({
      where: tenantId ? { id, tenantId } : { id },
    });
  }

  async update(
    id: string,
    body: Partial<{
      branchId: string;
      name: string;
      accountNumber: string;
      bank: string;
      currency: string;
      type: string;
      isActive: boolean;
    }>,
  ) {
    const existing = await this.findOne(id);
    if (!existing) {
      throw new NotFoundException('Cuenta bancaria no encontrada');
    }

    await this.banksRepository.update(id, body);
    return this.findOne(id);
  }

  async remove(id: string) {
    const existing = await this.findOne(id);
    if (!existing) {
      throw new NotFoundException('Cuenta bancaria no encontrada');
    }

    await this.banksRepository.delete(id);
    return { deleted: true };
  }

  async debugColumns() {
    return this.dataSource.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'bank'
      ORDER BY ordinal_position
    `);
  }
}

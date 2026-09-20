import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { BanksService } from './banks.service';
import { Bank } from './entities/bank.entity';

// Auditoría BUSINESS (hallazgo #1, transversal #6): update()/remove() no filtraban por
// tenant (a diferencia de findOne(), que sí lo hacía) — cualquier usuario autenticado podía
// editar o borrar la cuenta bancaria de OTRO tenant conociendo su id.
describe('BanksService — aislamiento por tenant', () => {
  let service: BanksService;
  let banksRepo: { findOne: jest.Mock; update: jest.Mock; delete: jest.Mock };

  const TENANT_A = 'tenant-A';
  const TENANT_B = 'tenant-B';
  // BanksService.findOne() valida formato UUID antes de consultar — usar un id realista.
  const ACCOUNT_B = '11111111-1111-4111-8111-111111111111';

  function fakeBankLookup(where: { id: string; tenantId?: string }) {
    if (where.id !== ACCOUNT_B) return Promise.resolve(null);
    if (where.tenantId && where.tenantId !== TENANT_B) return Promise.resolve(null);
    return Promise.resolve({ id: ACCOUNT_B, tenantId: TENANT_B, name: 'Cuenta B' });
  }

  beforeEach(async () => {
    banksRepo = {
      findOne: jest.fn(({ where }) => fakeBankLookup(where)),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BanksService,
        { provide: getRepositoryToken(Bank), useValue: banksRepo },
        { provide: getDataSourceToken(), useValue: {} },
      ],
    }).compile();

    service = module.get<BanksService>(BanksService);
  });

  describe('update()', () => {
    it('rechaza editar la cuenta bancaria de OTRO tenant', async () => {
      await expect(service.update(ACCOUNT_B, { name: 'hackeado' }, TENANT_A)).rejects.toThrow(
        NotFoundException,
      );
      expect(banksRepo.update).not.toHaveBeenCalled();
    });

    it('permite editar la cuenta bancaria del MISMO tenant', async () => {
      await expect(service.update(ACCOUNT_B, { name: 'nuevo nombre' }, TENANT_B)).resolves.toBeDefined();
      expect(banksRepo.update).toHaveBeenCalledWith(ACCOUNT_B, { name: 'nuevo nombre' });
    });
  });

  describe('remove()', () => {
    it('rechaza borrar la cuenta bancaria de OTRO tenant', async () => {
      await expect(service.remove(ACCOUNT_B, TENANT_A)).rejects.toThrow(NotFoundException);
      expect(banksRepo.delete).not.toHaveBeenCalled();
    });

    it('permite borrar la cuenta bancaria del MISMO tenant', async () => {
      await expect(service.remove(ACCOUNT_B, TENANT_B)).resolves.toEqual({ deleted: true });
      expect(banksRepo.delete).toHaveBeenCalledWith(ACCOUNT_B);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MovementsService } from './movements.service';
import { Movement } from './entities/movement.entity';
import { Bank } from '../banks/entities/bank.entity';

// Auditoría BUSINESS (hallazgo #1, transversal #6): create()/approve()/reject()/
// findByAccount() no verificaban que la cuenta bancaria perteneciera al tenant de quien
// hace la llamada. Estas pruebas fijan el comportamiento correcto (rechazar cross-tenant,
// permitir same-tenant) y sirven de regresión.
describe('MovementsService — aislamiento por tenant', () => {
  let service: MovementsService;
  let movementsRepo: {
    findOne: jest.Mock;
    find: jest.Mock;
    update: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let banksRepo: { findOne: jest.Mock; save: jest.Mock };

  const TENANT_A = 'tenant-A';
  const TENANT_B = 'tenant-B';
  const ACCOUNT_B = 'acc-belongs-to-tenant-B';

  // Simula una DB real: una fila con id=ACCOUNT_B y tenantId=TENANT_B solo se devuelve si
  // el `where` no exige tenantId, o si exige exactamente TENANT_B — igual que haría Postgres.
  function fakeBankLookup(where: { id: string; tenantId?: string }) {
    if (where.id !== ACCOUNT_B) return Promise.resolve(null);
    if (where.tenantId && where.tenantId !== TENANT_B) return Promise.resolve(null);
    return Promise.resolve({ id: ACCOUNT_B, tenantId: TENANT_B, balance: 1000 });
  }

  beforeEach(async () => {
    movementsRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((data) => data),
      save: jest.fn((data) => Promise.resolve({ id: 'mov-1', ...data })),
    };
    banksRepo = {
      findOne: jest.fn(({ where }) => fakeBankLookup(where)),
      save: jest.fn((data) => Promise.resolve(data)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MovementsService,
        { provide: getRepositoryToken(Movement), useValue: movementsRepo },
        { provide: getRepositoryToken(Bank), useValue: banksRepo },
        { provide: DataSource, useValue: {} },
      ],
    }).compile();

    service = module.get<MovementsService>(MovementsService);
  });

  describe('create()', () => {
    it('rechaza crear un movimiento sobre la cuenta de OTRO tenant', async () => {
      await expect(
        service.create(ACCOUNT_B, 'INCOME', 'VENTAS', 'venta ajena', 100, undefined, undefined, TENANT_A),
      ).rejects.toThrow(BadRequestException);
    });

    it('permite crear un movimiento sobre una cuenta del MISMO tenant', async () => {
      const result = await service.create(
        ACCOUNT_B,
        'INCOME',
        'VENTAS',
        'venta propia',
        100,
        undefined,
        undefined,
        TENANT_B,
      );
      expect(result).toBeDefined();
      expect(movementsRepo.save).toHaveBeenCalled();
    });
  });

  describe('approve()', () => {
    beforeEach(() => {
      movementsRepo.findOne.mockResolvedValue({
        id: 'mov-1',
        accountId: ACCOUNT_B,
        status: 'PENDING_APPROVAL',
        type: 'INCOME',
        amount: '100',
      });
    });

    it('rechaza aprobar un movimiento cuya cuenta es de OTRO tenant', async () => {
      await expect(service.approve('mov-1', 'admin@a.com', TENANT_A)).rejects.toThrow();
      expect(movementsRepo.update).not.toHaveBeenCalled();
    });

    it('permite aprobar un movimiento cuya cuenta es del MISMO tenant', async () => {
      await expect(service.approve('mov-1', 'admin@b.com', TENANT_B)).resolves.toBeDefined();
      expect(movementsRepo.update).toHaveBeenCalled();
    });
  });

  describe('reject()', () => {
    beforeEach(() => {
      movementsRepo.findOne.mockResolvedValue({
        id: 'mov-1',
        accountId: ACCOUNT_B,
        status: 'PENDING_APPROVAL',
        type: 'INCOME',
        amount: '100',
      });
    });

    it('rechaza rechazar (sic) un movimiento cuya cuenta es de OTRO tenant', async () => {
      await expect(service.reject('mov-1', 'admin@a.com', 'motivo', TENANT_A)).rejects.toThrow();
    });

    it('permite rechazar un movimiento cuya cuenta es del MISMO tenant', async () => {
      await expect(service.reject('mov-1', 'admin@b.com', 'motivo', TENANT_B)).resolves.toBeDefined();
      expect(movementsRepo.update).toHaveBeenCalled();
    });
  });

  describe('findByAccount()', () => {
    it('rechaza listar movimientos de la cuenta de OTRO tenant', async () => {
      await expect(service.findByAccount(ACCOUNT_B, TENANT_A)).rejects.toThrow();
    });

    it('permite listar movimientos de una cuenta del MISMO tenant', async () => {
      await expect(service.findByAccount(ACCOUNT_B, TENANT_B)).resolves.toBeDefined();
    });
  });
});

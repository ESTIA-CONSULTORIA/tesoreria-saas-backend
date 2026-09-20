import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TransfersService } from './transfers.service';
import { Transfer } from './entities/transfer.entity';
import { Bank } from '../banks/entities/bank.entity';

// Auditoría BUSINESS (hallazgo #1, transversal #6): authorize()/reject() no verificaban
// que la transferencia perteneciera al tenant de quien llama, y create() no verificaba que
// fromAccountId/toAccountId fueran cuentas del tenant que transfiere.
describe('TransfersService — aislamiento por tenant', () => {
  let service: TransfersService;
  let transferRepo: { findOne: jest.Mock; update: jest.Mock; create: jest.Mock; save: jest.Mock; find: jest.Mock };
  let banksRepo: { findOne: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  const TENANT_A = 'tenant-A';
  const TENANT_B = 'tenant-B';
  const ACCOUNT_B1 = 'acc-B1';
  const ACCOUNT_B2 = 'acc-B2';

  function fakeBankLookup(where: { id: string; tenantId?: string }) {
    const owners: Record<string, string> = { [ACCOUNT_B1]: TENANT_B, [ACCOUNT_B2]: TENANT_B };
    const owner = owners[where.id];
    if (!owner) return Promise.resolve(null);
    if (where.tenantId && where.tenantId !== owner) return Promise.resolve(null);
    return Promise.resolve({ id: where.id, tenantId: owner, balance: 1000 });
  }

  beforeEach(async () => {
    transferRepo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((data) => data),
      save: jest.fn((data) => Promise.resolve({ id: 'transfer-1', ...data })),
      find: jest.fn().mockResolvedValue([]),
    };
    banksRepo = { findOne: jest.fn(({ where }) => fakeBankLookup(where)) };
    dataSource = {
      // Si el ownership check funciona, ni siquiera debería llegar a abrir una transacción
      // en los casos cross-tenant — lo dejamos fallar fuerte si se invoca sin querer.
      transaction: jest.fn(() => {
        throw new Error('dataSource.transaction() no debería invocarse para un intento cross-tenant');
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransfersService,
        { provide: getRepositoryToken(Transfer), useValue: transferRepo },
        { provide: getRepositoryToken(Bank), useValue: banksRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<TransfersService>(TransfersService);
  });

  describe('create()', () => {
    it('rechaza transferir INTERCOMPAÑIA entre cuentas que NO son del tenant solicitante', async () => {
      await expect(
        service.create(
          ACCOUNT_B1,
          ACCOUNT_B2,
          100,
          'concepto',
          'INTERCOMPAÑIA',
          'empresa-1',
          'empresa-2',
          undefined,
          undefined,
          TENANT_A,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('permite transferir INTERCOMPAÑIA entre cuentas del MISMO tenant', async () => {
      const result = await service.create(
        ACCOUNT_B1,
        ACCOUNT_B2,
        100,
        'concepto',
        'INTERCOMPAÑIA',
        'empresa-1',
        'empresa-2',
        undefined,
        undefined,
        TENANT_B,
      );
      expect(result).toBeDefined();
      expect(transferRepo.save).toHaveBeenCalled();
    });
  });

  const PENDING_TRANSFER = {
    id: 'transfer-1',
    tenantId: TENANT_B,
    status: 'PENDIENTE',
    tipo: 'INTERCOMPAÑIA',
    fromAccountId: ACCOUNT_B1,
    toAccountId: ACCOUNT_B2,
    amount: 100,
  };

  // Simula transferRepo.findOne({ where: { id } | { id, tenantId } }) — igual que
  // fakeBankLookup, solo devuelve la fila si el tenantId pedido coincide (o no se pidió).
  function fakeTransferLookup(where: { id: string; tenantId?: string }) {
    if (where.id !== PENDING_TRANSFER.id) return Promise.resolve(null);
    if (where.tenantId && where.tenantId !== PENDING_TRANSFER.tenantId) return Promise.resolve(null);
    return Promise.resolve({ ...PENDING_TRANSFER });
  }

  describe('authorize()', () => {
    beforeEach(() => {
      transferRepo.findOne.mockImplementation(({ where }: any) => fakeTransferLookup(where));
      dataSource.transaction.mockReset();
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb({
          // manager.findOne(EntityClass, options) — dos argumentos, no uno.
          findOne: jest.fn((_entity: any, options: any) => fakeBankLookup(options.where)),
          // TypeORM's manager.save() acepta save(entity) o save(EntityClass, entity) —
          // el código usa ambas formas según el llamado; se soportan las dos.
          save: jest.fn((a: any, b?: any) => Promise.resolve(b !== undefined ? b : a)),
          update: jest.fn().mockResolvedValue(undefined),
          create: jest.fn((a: any, b?: any) => (b !== undefined ? b : a)),
        }),
      );
    });

    it('rechaza autorizar una transferencia de OTRO tenant', async () => {
      await expect(service.authorize('transfer-1', TENANT_A)).rejects.toThrow();
    });

    it('permite autorizar una transferencia del MISMO tenant', async () => {
      await expect(service.authorize('transfer-1', TENANT_B)).resolves.toBeDefined();
    });
  });

  describe('reject()', () => {
    beforeEach(() => {
      transferRepo.findOne.mockImplementation(({ where }: any) => fakeTransferLookup(where));
    });

    it('rechaza rechazar (sic) una transferencia de OTRO tenant', async () => {
      await expect(service.reject('transfer-1', 'motivo', TENANT_A)).rejects.toThrow();
      expect(transferRepo.update).not.toHaveBeenCalled();
    });

    it('permite rechazar una transferencia del MISMO tenant', async () => {
      await expect(service.reject('transfer-1', 'motivo', TENANT_B)).resolves.toBeDefined();
      expect(transferRepo.update).toHaveBeenCalled();
    });
  });
});

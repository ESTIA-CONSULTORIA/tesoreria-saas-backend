import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReconciliationService } from './reconciliation.service';
import { Invoice, ReconciliationStatus } from './entities/invoice.entity';
import { Movement } from '../movements/entities/movement.entity';
import { Bank } from '../banks/entities/bank.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Company } from '../companies/entities/company.entity';

// Auditoría BUSINESS (hallazgo transversal #6): deleteInvoice()/updateInvoiceStatus()/
// markForManualReview()/manualReconciliation()/getAvailableMovements() no filtraban por
// tenant en absoluto — un usuario autenticado de un tenant podía leer/mutar la factura o el
// movimiento de OTRO tenant conociendo su id.
describe('ReconciliationService — aislamiento por tenant', () => {
  let service: ReconciliationService;
  let invoicesRepo: { findOne: jest.Mock; find: jest.Mock; create: jest.Mock; save: jest.Mock; update: jest.Mock; delete: jest.Mock };
  let movementsRepo: { findOne: jest.Mock; createQueryBuilder: jest.Mock };
  let banksRepo: { findOne: jest.Mock };

  const TENANT_A = 'tenant-A';
  const TENANT_B = 'tenant-B';
  const INVOICE_B = 'invoice-B';
  const ACCOUNT_B = 'acc-B';
  const MOVEMENT_B = 'mov-B';

  function fakeInvoiceLookup(where: { id: string }) {
    if (where.id !== INVOICE_B) return Promise.resolve(null);
    return Promise.resolve({ id: INVOICE_B, tenantId: TENANT_B, reconciliationStatus: ReconciliationStatus.PENDIENTE });
  }

  function fakeBankLookup(where: { id: string; tenantId?: string }) {
    if (where.id !== ACCOUNT_B) return Promise.resolve(null);
    if (where.tenantId && where.tenantId !== TENANT_B) return Promise.resolve(null);
    return Promise.resolve({ id: ACCOUNT_B, tenantId: TENANT_B });
  }

  beforeEach(async () => {
    invoicesRepo = {
      findOne: jest.fn(({ where }) => fakeInvoiceLookup(where)),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((data) => data),
      save: jest.fn((data) => Promise.resolve(data)),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    movementsRepo = {
      findOne: jest.fn(({ where }) => (where.id === MOVEMENT_B ? Promise.resolve({ id: MOVEMENT_B, accountId: ACCOUNT_B }) : Promise.resolve(null))),
      createQueryBuilder: jest.fn(() => {
        const qb: any = {
          andWhere: jest.fn(() => qb),
          orderBy: jest.fn(() => qb),
          getMany: jest.fn().mockResolvedValue([]),
        };
        return qb;
      }),
    };
    banksRepo = { findOne: jest.fn(({ where }) => fakeBankLookup(where)) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReconciliationService,
        { provide: getRepositoryToken(Invoice), useValue: invoicesRepo },
        { provide: getRepositoryToken(Movement), useValue: movementsRepo },
        { provide: getRepositoryToken(Bank), useValue: banksRepo },
        { provide: getRepositoryToken(Branch), useValue: { find: jest.fn() } },
        { provide: getRepositoryToken(Company), useValue: { find: jest.fn() } },
      ],
    }).compile();

    service = module.get<ReconciliationService>(ReconciliationService);
  });

  describe('updateInvoiceStatus()', () => {
    it('rechaza cambiar el status de una factura de OTRO tenant', async () => {
      await expect(
        service.updateInvoiceStatus(INVOICE_B, ReconciliationStatus.CONCILIADA, TENANT_A),
      ).rejects.toThrow();
      expect(invoicesRepo.update).not.toHaveBeenCalled();
    });

    it('permite cambiar el status de una factura del MISMO tenant', async () => {
      await expect(
        service.updateInvoiceStatus(INVOICE_B, ReconciliationStatus.CONCILIADA, TENANT_B),
      ).resolves.toBeDefined();
      expect(invoicesRepo.update).toHaveBeenCalled();
    });
  });

  describe('markForManualReview()', () => {
    it('rechaza marcar para revisión una factura de OTRO tenant', async () => {
      await expect(service.markForManualReview(INVOICE_B, TENANT_A)).rejects.toThrow();
      expect(invoicesRepo.update).not.toHaveBeenCalled();
    });

    it('permite marcar para revisión una factura del MISMO tenant', async () => {
      await expect(service.markForManualReview(INVOICE_B, TENANT_B)).resolves.toBeDefined();
    });
  });

  describe('deleteInvoice()', () => {
    it('rechaza borrar una factura de OTRO tenant', async () => {
      await expect(service.deleteInvoice(INVOICE_B, TENANT_A)).rejects.toThrow();
      expect(invoicesRepo.delete).not.toHaveBeenCalled();
    });

    it('permite borrar una factura del MISMO tenant', async () => {
      await expect(service.deleteInvoice(INVOICE_B, TENANT_B)).resolves.toEqual({ deleted: true });
    });
  });

  describe('manualReconciliation()', () => {
    it('rechaza conciliar una factura de OTRO tenant', async () => {
      await expect(service.manualReconciliation(INVOICE_B, MOVEMENT_B, TENANT_A)).rejects.toThrow();
      expect(invoicesRepo.update).not.toHaveBeenCalled();
    });

    it('rechaza conciliar con un movimiento cuya cuenta es de OTRO tenant (aunque la factura sí sea propia)', async () => {
      // Reusa INVOICE_B como si fuera del tenant que llama, pero apunta a un movimiento cuya
      // cuenta pertenece a TENANT_B, mientras el llamador dice ser TENANT_A.
      invoicesRepo.findOne.mockResolvedValueOnce({ id: INVOICE_B, tenantId: TENANT_A, reconciliationStatus: ReconciliationStatus.PENDIENTE });
      await expect(service.manualReconciliation(INVOICE_B, MOVEMENT_B, TENANT_A)).rejects.toThrow();
      expect(invoicesRepo.update).not.toHaveBeenCalled();
    });

    it('permite conciliar una factura y un movimiento del MISMO tenant', async () => {
      await expect(service.manualReconciliation(INVOICE_B, MOVEMENT_B, TENANT_B)).resolves.toBeDefined();
      expect(invoicesRepo.update).toHaveBeenCalled();
    });
  });

  describe('getAvailableMovements()', () => {
    it('rechaza listar movimientos de una cuenta de OTRO tenant', async () => {
      await expect(service.getAvailableMovements(ACCOUNT_B, TENANT_A)).rejects.toThrow();
    });

    it('permite listar movimientos de una cuenta del MISMO tenant', async () => {
      await expect(service.getAvailableMovements(ACCOUNT_B, TENANT_B)).resolves.toBeDefined();
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { SalesService } from './sales.service';
import { ShiftsService } from './shifts.service';
import { Sale } from './entities/sale.entity';
import { Shift } from './entities/shift.entity';
import { Product } from './entities/product.entity';
import { Recipe } from '../costs/entities/recipe.entity';
import { Insumo } from '../costs/entities/insumo.entity';
import { TenantSetting } from '../tenant-settings/entities/tenant-setting.entity';
import { InsumoAlertsService } from './insumo-alerts.service';

// Auditoría BUSINESS (hallazgo transversal #6): getSale/paySale/cancelSale/applyDiscount/
// returnSale (SalesService) y withdrawal/deposit/precut/closeShift/getShift/getShiftSummary
// (ShiftsService) no verificaban que la venta/turno perteneciera al tenant de quien llama —
// ambas entidades tienen tenantId propio.
describe('SalesService — aislamiento por tenant', () => {
  let service: SalesService;
  let salesRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock; update: jest.Mock; createQueryBuilder: jest.Mock };

  const TENANT_A = 'tenant-A';
  const TENANT_B = 'tenant-B';
  const SALE_B = 'sale-B';

  function fakeSaleLookup(where: { id: string; tenantId?: string }) {
    if (where.id !== SALE_B) return Promise.resolve(null);
    if (where.tenantId && where.tenantId !== TENANT_B) return Promise.resolve(null);
    return Promise.resolve({
      id: SALE_B,
      tenantId: TENANT_B,
      status: 'ABIERTA',
      folio: 'VTA-1',
      cajero: 'cajero-1',
      turnoId: 'turno-1',
      sucursalId: 'suc-1',
    });
  }

  beforeEach(async () => {
    salesRepo = {
      findOne: jest.fn(({ where }) => fakeSaleLookup(where)),
      create: jest.fn((data) => data),
      save: jest.fn((data) => Promise.resolve(data)),
      update: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: getRepositoryToken(Sale), useValue: salesRepo },
        { provide: getRepositoryToken(Product), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Recipe), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Insumo), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(TenantSetting), useValue: { findOne: jest.fn() } },
        { provide: getDataSourceToken(), useValue: { transaction: jest.fn() } },
        { provide: InsumoAlertsService, useValue: { upsert: jest.fn() } },
      ],
    }).compile();

    service = module.get<SalesService>(SalesService);
  });

  describe('findOne()', () => {
    it('no devuelve la venta de OTRO tenant', async () => {
      await expect(service.findOne(SALE_B, TENANT_A)).resolves.toBeNull();
    });

    it('sí devuelve la venta del MISMO tenant', async () => {
      await expect(service.findOne(SALE_B, TENANT_B)).resolves.toBeDefined();
    });
  });

  describe('pay()', () => {
    const payload = { formaPago: 'EFECTIVO', montoRecibido: 100, cambio: 0 };

    it('rechaza cobrar una venta de OTRO tenant', async () => {
      await expect(service.pay(SALE_B, payload, TENANT_A)).rejects.toThrow();
      expect(salesRepo.update).not.toHaveBeenCalled();
    });

    it('permite cobrar una venta del MISMO tenant', async () => {
      await expect(service.pay(SALE_B, payload, TENANT_B)).resolves.toBeDefined();
      expect(salesRepo.update).toHaveBeenCalled();
    });
  });

  describe('cancel()', () => {
    it('rechaza cancelar una venta de OTRO tenant', async () => {
      await expect(service.cancel(SALE_B, 'motivo', TENANT_A)).rejects.toThrow();
      expect(salesRepo.update).not.toHaveBeenCalled();
    });

    it('permite cancelar una venta del MISMO tenant', async () => {
      await expect(service.cancel(SALE_B, 'motivo', TENANT_B)).resolves.toBeDefined();
    });
  });

  describe('applyDiscount()', () => {
    it('rechaza aplicar descuento a una venta de OTRO tenant', async () => {
      await expect(service.applyDiscount(SALE_B, 10, 90, TENANT_A)).rejects.toThrow();
      expect(salesRepo.update).not.toHaveBeenCalled();
    });

    it('permite aplicar descuento a una venta del MISMO tenant', async () => {
      await expect(service.applyDiscount(SALE_B, 10, 90, TENANT_B)).resolves.toBeDefined();
    });
  });

  describe('returnSale()', () => {
    const payload = { items: [], motivo: 'motivo', montoDevolucion: 50 };

    it('rechaza devolver una venta de OTRO tenant', async () => {
      // returnSale() solo exige status PAGADA — el fixture usa ABIERTA para los otros tests,
      // así que aquí se ajusta el mock puntualmente a PAGADA para no chocar con esa regla.
      salesRepo.findOne.mockImplementation(({ where }: any) =>
        where.id === SALE_B && (!where.tenantId || where.tenantId === TENANT_B)
          ? Promise.resolve({ id: SALE_B, tenantId: TENANT_B, status: 'PAGADA', folio: 'VTA-1', cajero: 'c', turnoId: 't', sucursalId: 's' })
          : Promise.resolve(null),
      );
      await expect(service.returnSale(SALE_B, payload, TENANT_A)).rejects.toThrow();
      expect(salesRepo.save).not.toHaveBeenCalled();
    });

    it('permite devolver una venta PAGADA del MISMO tenant', async () => {
      salesRepo.findOne.mockImplementation(({ where }: any) =>
        where.id === SALE_B && (!where.tenantId || where.tenantId === TENANT_B)
          ? Promise.resolve({ id: SALE_B, tenantId: TENANT_B, status: 'PAGADA', folio: 'VTA-1', cajero: 'c', turnoId: 't', sucursalId: 's' })
          : Promise.resolve(null),
      );
      await expect(service.returnSale(SALE_B, payload, TENANT_B)).resolves.toBeDefined();
      expect(salesRepo.save).toHaveBeenCalled();
    });
  });
});

describe('ShiftsService — aislamiento por tenant', () => {
  let service: ShiftsService;
  let shiftsRepo: { findOne: jest.Mock; update: jest.Mock };
  let salesRepo: { find: jest.Mock };

  const TENANT_A = 'tenant-A';
  const TENANT_B = 'tenant-B';
  const SHIFT_B = 'shift-B';

  function fakeShiftLookup(where: { id: string; tenantId?: string }) {
    if (where.id !== SHIFT_B) return Promise.resolve(null);
    if (where.tenantId && where.tenantId !== TENANT_B) return Promise.resolve(null);
    return Promise.resolve({
      id: SHIFT_B,
      tenantId: TENANT_B,
      status: 'ABIERTO',
      precorteGuardado: true,
      totalRetiros: 0,
      totalDepositos: 0,
      efectivoContado: 0,
    });
  }

  beforeEach(async () => {
    shiftsRepo = {
      findOne: jest.fn(({ where }) => fakeShiftLookup(where)),
      update: jest.fn().mockResolvedValue(undefined),
    };
    salesRepo = { find: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShiftsService,
        { provide: getRepositoryToken(Shift), useValue: shiftsRepo },
        { provide: getRepositoryToken(Sale), useValue: salesRepo },
      ],
    }).compile();

    service = module.get<ShiftsService>(ShiftsService);
  });

  describe('withdrawal()', () => {
    it('rechaza registrar un retiro en el turno de OTRO tenant', async () => {
      await expect(
        service.withdrawal(SHIFT_B, { monto: 100, motivo: 'm', autorizadoPor: 'x' }, TENANT_A),
      ).rejects.toThrow();
      expect(shiftsRepo.update).not.toHaveBeenCalled();
    });

    it('permite registrar un retiro en el turno del MISMO tenant', async () => {
      await expect(
        service.withdrawal(SHIFT_B, { monto: 100, motivo: 'm', autorizadoPor: 'x' }, TENANT_B),
      ).resolves.toBeDefined();
      expect(shiftsRepo.update).toHaveBeenCalled();
    });
  });

  describe('deposit()', () => {
    it('rechaza registrar un depósito en el turno de OTRO tenant', async () => {
      await expect(
        service.deposit(SHIFT_B, { monto: 100, origen: 'o', autorizadoPor: 'x' }, TENANT_A),
      ).rejects.toThrow();
      expect(shiftsRepo.update).not.toHaveBeenCalled();
    });

    it('permite registrar un depósito en el turno del MISMO tenant', async () => {
      await expect(
        service.deposit(SHIFT_B, { monto: 100, origen: 'o', autorizadoPor: 'x' }, TENANT_B),
      ).resolves.toBeDefined();
    });
  });

  describe('precut()', () => {
    it('rechaza guardar el precorte del turno de OTRO tenant', async () => {
      shiftsRepo.findOne.mockImplementation(({ where }: any) =>
        where.id === SHIFT_B && (!where.tenantId || where.tenantId === TENANT_B)
          ? Promise.resolve({ id: SHIFT_B, tenantId: TENANT_B, status: 'ABIERTO', precorteGuardado: false })
          : Promise.resolve(null),
      );
      await expect(service.precut(SHIFT_B, { efectivoContado: 100 }, TENANT_A)).rejects.toThrow();
      expect(shiftsRepo.update).not.toHaveBeenCalled();
    });

    it('permite guardar el precorte del turno del MISMO tenant', async () => {
      shiftsRepo.findOne.mockImplementation(({ where }: any) =>
        where.id === SHIFT_B && (!where.tenantId || where.tenantId === TENANT_B)
          ? Promise.resolve({ id: SHIFT_B, tenantId: TENANT_B, status: 'ABIERTO', precorteGuardado: false })
          : Promise.resolve(null),
      );
      await expect(service.precut(SHIFT_B, { efectivoContado: 100 }, TENANT_B)).resolves.toBeDefined();
    });
  });

  describe('closeShift()', () => {
    it('rechaza cerrar el turno de OTRO tenant', async () => {
      await expect(service.closeShift(SHIFT_B, {}, TENANT_A)).rejects.toThrow();
      expect(shiftsRepo.update).not.toHaveBeenCalled();
    });

    it('permite cerrar el turno del MISMO tenant', async () => {
      await expect(service.closeShift(SHIFT_B, {}, TENANT_B)).resolves.toBeDefined();
      expect(shiftsRepo.update).toHaveBeenCalled();
    });
  });

  describe('findOne() / getSummary()', () => {
    it('no devuelve el turno de OTRO tenant', async () => {
      await expect(service.findOne(SHIFT_B, TENANT_A)).resolves.toBeNull();
    });

    it('sí devuelve el turno del MISMO tenant', async () => {
      await expect(service.findOne(SHIFT_B, TENANT_B)).resolves.toBeDefined();
    });

    it('rechaza el resumen del turno de OTRO tenant', async () => {
      await expect(service.getSummary(SHIFT_B, TENANT_A)).rejects.toThrow();
    });

    it('permite el resumen del turno del MISMO tenant', async () => {
      await expect(service.getSummary(SHIFT_B, TENANT_B)).resolves.toBeDefined();
    });
  });
});

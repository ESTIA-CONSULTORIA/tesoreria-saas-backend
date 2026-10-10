import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SalesService } from './sales.service';
import { Sale } from './entities/sale.entity';
import { Product } from './entities/product.entity';
import { Recipe } from '../costs/entities/recipe.entity';
import { Insumo } from '../costs/entities/insumo.entity';
import { TenantSetting } from '../tenant-settings/entities/tenant-setting.entity';
import { TenantSettingsService } from '../tenant-settings/tenant-settings.service';
import { InsumoAlertsService } from './insumo-alerts.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { CostsService } from '../costs/costs.service';
import { Cita } from '../appointments/entities/cita.entity';
import { Patient } from '../patients/entities/patient.entity';

// POS flexible, capacidad ligar_venta_a_cita: valida contra SalesService.create()/pay() REALES y
// contra el AppointmentsService REAL (solo se simula la base de datos), para que un cambio en
// el gating, en la regla de estados o en el aislamiento por tenant rompa estas pruebas.
const TENANT_A = 'tenant-A';
const TENANT_B = 'tenant-B';

type CitaRow = { id: string; tenantId: string; estado: 'PENDIENTE' | 'CONFIRMADA' | 'COMPLETADA' | 'CANCELADA' };

describe('SalesService — capacidad ligar_venta_a_cita', () => {
  let service: SalesService;
  let citas: Map<string, CitaRow>;
  let citasRepo: { findOne: jest.Mock; update: jest.Mock; createQueryBuilder: jest.Mock };
  let hasPosCapability: jest.Mock;
  let transaction: jest.Mock;
  let managerCreate: jest.Mock;
  let salesRepo: { createQueryBuilder: jest.Mock; findOne: jest.Mock; update: jest.Mock };
  let managerUpdate: jest.Mock;

  function capacidades(ligar: boolean) {
    hasPosCapability.mockImplementation((_t: string, cap: string) => Promise.resolve(cap === 'ligar_venta_a_cita' ? ligar : false));
  }

  function saleData(extra: Record<string, any> = {}, pagada = true) {
    return {
      items: [{ productoId: 'prod-cita', cantidad: 1 }] as any, // el servidor pone el precio ($100 + 16% = $116); solo interesa el vínculo
      subtotal: 100, descuento: 0, impuestos: 16, total: 116,
      formasPago: pagada ? [{ forma: 'EFECTIVO', monto: 116 }] : [],
      cajero: 'cajero-1', turnoId: 'turno-1', sucursalId: 'sucursal-A',
      tenantId: TENANT_A, folio: 'VTA-TEST-001',
      ...extra,
    };
  }

  const salePersistida = () => managerCreate.mock.calls.find(([entity]) => entity === Sale)![1];

  beforeEach(async () => {
    citas = new Map<string, CitaRow>([
      ['cita-pendiente', { id: 'cita-pendiente', tenantId: TENANT_A, estado: 'PENDIENTE' }],
      ['cita-confirmada', { id: 'cita-confirmada', tenantId: TENANT_A, estado: 'CONFIRMADA' }],
      ['cita-completada', { id: 'cita-completada', tenantId: TENANT_A, estado: 'COMPLETADA' }],
      ['cita-cancelada', { id: 'cita-cancelada', tenantId: TENANT_A, estado: 'CANCELADA' }],
      ['cita-de-B', { id: 'cita-de-B', tenantId: TENANT_B, estado: 'PENDIENTE' }],
    ]);
    citasRepo = {
      // Respeta el filtro por tenant como lo haría TypeORM: la cita de otro tenant "no existe".
      findOne: jest.fn(({ where }) => {
        const c = citas.get(where.id);
        return Promise.resolve(c && (!where.tenantId || c.tenantId === where.tenantId) ? { ...c } : null);
      }),
      update: jest.fn((id: string, patch: Partial<CitaRow>) => {
        Object.assign(citas.get(id)!, patch);
        return Promise.resolve(undefined);
      }),
      createQueryBuilder: jest.fn(),
    };

    hasPosCapability = jest.fn();
    capacidades(true);

    managerCreate = jest.fn((_entity, data) => data);
    managerUpdate = jest.fn().mockResolvedValue(undefined);
    const manager = {
      create: managerCreate,
      save: jest.fn((data) => Promise.resolve({ id: 'sale-1', ...data })),
      update: managerUpdate,
      findOne: jest.fn().mockResolvedValue(null),
      getRepository: jest.fn((entity) => (entity === Cita ? citasRepo : undefined)),
    };
    transaction = jest.fn((cb: any) => cb(manager));
    salesRepo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        AppointmentsService, // REAL: la regla de estados y el filtro por tenant viven aquí
        { provide: CostsService, useValue: { createJustifiable: jest.fn() } },
        { provide: getRepositoryToken(Cita), useValue: citasRepo },
        { provide: getRepositoryToken(Patient), useValue: {} },
        { provide: getRepositoryToken(Sale), useValue: salesRepo },
        { provide: getRepositoryToken(Product), useValue: { findOne: jest.fn().mockResolvedValue({ id: 'prod-cita', name: 'Consulta', price: 100, type: 'SIMPLE', esServicio: false, tenantId: TENANT_A }) } },
        { provide: getRepositoryToken(Recipe), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Insumo), useValue: { findOne: jest.fn(), manager: { findOne: jest.fn() } } },
        { provide: getRepositoryToken(TenantSetting), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
        { provide: DataSource, useValue: { transaction } },
        { provide: InsumoAlertsService, useValue: {} },
        { provide: TenantSettingsService, useValue: { getIvaConfig: jest.fn(() => Promise.resolve({ ivaTasaDefault: '16', preciosIncluyenIva: false })), hasPosCapability } },
      ],
    }).compile();
    service = module.get(SalesService);
  });

  describe('venta normal (sin citaId)', () => {
    it('queda exactamente igual: citaId null, no consulta la capacidad ni toca ninguna cita', async () => {
      await service.create(saleData() as any);

      expect(salePersistida().citaId).toBeNull();
      expect(hasPosCapability).not.toHaveBeenCalledWith(TENANT_A, 'ligar_venta_a_cita');
      expect(citasRepo.findOne).not.toHaveBeenCalled();
      expect(citasRepo.update).not.toHaveBeenCalled();
    });

    it('pay() de una venta sin cita usa el camino de siempre (salesRepo.update, sin transacción extra)', async () => {
      salesRepo.findOne.mockResolvedValue({ id: 'v1', status: 'ABIERTA', tenantId: TENANT_A, citaId: null });

      await service.pay('v1', { formaPago: 'EFECTIVO', montoRecibido: 100, cambio: 0 }, TENANT_A);

      expect(salesRepo.update).toHaveBeenCalledWith('v1', expect.objectContaining({ status: 'PAGADA' }));
      expect(transaction).not.toHaveBeenCalled();
      expect(citasRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('capacidad ACTIVA', () => {
    it('ligar a cita PENDIENTE con venta PAGADA: guarda el citaId y la cita pasa a COMPLETADA', async () => {
      await service.create(saleData({ citaId: 'cita-pendiente' }) as any);

      expect(salePersistida().citaId).toBe('cita-pendiente');
      expect(citas.get('cita-pendiente')!.estado).toBe('COMPLETADA');
    });

    it('ligar a cita CONFIRMADA también la completa', async () => {
      await service.create(saleData({ citaId: 'cita-confirmada' }) as any);
      expect(citas.get('cita-confirmada')!.estado).toBe('COMPLETADA');
    });

    it('venta ABIERTA ligada: la cita NO cambia al crearla; pay() la completa en la misma transacción', async () => {
      await service.create(saleData({ citaId: 'cita-pendiente' }, false) as any);
      expect(salePersistida().citaId).toBe('cita-pendiente');
      expect(citas.get('cita-pendiente')!.estado).toBe('PENDIENTE');

      salesRepo.findOne.mockResolvedValue({ id: 'v1', status: 'ABIERTA', tenantId: TENANT_A, citaId: 'cita-pendiente' });
      transaction.mockClear();
      await service.pay('v1', { formaPago: 'EFECTIVO', montoRecibido: 100, cambio: 0 }, TENANT_A);

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(managerUpdate).toHaveBeenCalledWith(Sale, 'v1', expect.objectContaining({ status: 'PAGADA' }));
      expect(citas.get('cita-pendiente')!.estado).toBe('COMPLETADA');
    });

    it('rechaza ligar a una cita CANCELADA con mensaje claro, sin abrir transacción', async () => {
      await expect(service.create(saleData({ citaId: 'cita-cancelada' }) as any)).rejects.toThrow(
        'No se puede ligar una venta a una cita CANCELADA.',
      );
      expect(transaction).not.toHaveBeenCalled();
      expect(citas.get('cita-cancelada')!.estado).toBe('CANCELADA');
    });

    it('rechaza ligar a una cita de OTRO tenant (404, sin revelar que existe) y no la modifica', async () => {
      await expect(service.create(saleData({ citaId: 'cita-de-B' }) as any)).rejects.toThrow(NotFoundException);
      expect(transaction).not.toHaveBeenCalled();
      expect(citas.get('cita-de-B')!.estado).toBe('PENDIENTE');
    });

    it('cita inexistente: 404', async () => {
      await expect(service.create(saleData({ citaId: 'no-existe' }) as any)).rejects.toThrow(NotFoundException);
    });

    it('varias ventas ligadas a la misma cita (pagos parciales): permitido, sin restricción de unicidad', async () => {
      await service.create(saleData({ citaId: 'cita-pendiente', folio: 'VTA-1' }) as any);
      await expect(service.create(saleData({ citaId: 'cita-pendiente', folio: 'VTA-2' }) as any)).resolves.toBeDefined();
      expect(citas.get('cita-pendiente')!.estado).toBe('COMPLETADA');
    });

    it('cita ya COMPLETADA: se puede ligar y su estado no se vuelve a escribir', async () => {
      await expect(service.create(saleData({ citaId: 'cita-completada' }) as any)).resolves.toBeDefined();
      expect(salePersistida().citaId).toBe('cita-completada');
      expect(citasRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('capacidad INACTIVA', () => {
    beforeEach(() => capacidades(false));

    it('ignora citaId aunque se mande: la venta se crea normal, sin vínculo y sin tocar la cita', async () => {
      await service.create(saleData({ citaId: 'cita-pendiente' }) as any);

      expect(salePersistida().citaId).toBeNull();
      expect(citasRepo.update).not.toHaveBeenCalled();
      expect(citas.get('cita-pendiente')!.estado).toBe('PENDIENTE');
    });

    it('ni siquiera valida la cita: un citaId CANCELADA o ajeno no rompe una venta cuando la capacidad está apagada', async () => {
      await expect(service.create(saleData({ citaId: 'cita-cancelada' }) as any)).resolves.toBeDefined();
      await expect(service.create(saleData({ citaId: 'cita-de-B', folio: 'VTA-2' }) as any)).resolves.toBeDefined();
      expect(citasRepo.findOne).not.toHaveBeenCalled();
    });
  });
});

describe('SalesService.buscarCitasParaLigar() y AppointmentsService.searchForPos()', () => {
  let service: SalesService;
  let appointments: AppointmentsService;
  let hasPosCapability: jest.Mock;
  let qb: Record<string, jest.Mock>;

  beforeEach(async () => {
    hasPosCapability = jest.fn().mockResolvedValue(true);
    // QueryBuilder encadenable que registra cada condición para poder inspeccionarlas.
    qb = {};
    for (const m of ['leftJoin', 'addSelect', 'where', 'andWhere', 'orderBy']) qb[m] = jest.fn(() => qb);
    qb.getRawAndEntities = jest.fn().mockResolvedValue({
      entities: [{ id: 'c1' }, { id: 'c2' }],
      raw: [{ pacienteNombre: 'Ana López' }, { pacienteNombre: null }],
    });
    const citasRepo = { createQueryBuilder: jest.fn(() => qb) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        AppointmentsService,
        { provide: CostsService, useValue: { createJustifiable: jest.fn() } },
        { provide: getRepositoryToken(Cita), useValue: citasRepo },
        { provide: getRepositoryToken(Patient), useValue: {} },
        { provide: getRepositoryToken(Sale), useValue: {} },
        { provide: getRepositoryToken(Product), useValue: {} },
        { provide: getRepositoryToken(Recipe), useValue: {} },
        { provide: getRepositoryToken(Insumo), useValue: {} },
        { provide: getRepositoryToken(TenantSetting), useValue: {} },
        { provide: DataSource, useValue: {} },
        { provide: InsumoAlertsService, useValue: {} },
        { provide: TenantSettingsService, useValue: { getIvaConfig: jest.fn(() => Promise.resolve({ ivaTasaDefault: '16', preciosIncluyenIva: false })), hasPosCapability } },
      ],
    }).compile();
    service = module.get(SalesService);
    appointments = module.get(AppointmentsService);
  });

  const condiciones = () => qb.andWhere.mock.calls.map(([sql]) => sql as string).concat(qb.where.mock.calls.map(([sql]) => sql as string));

  it('filtra siempre por el tenant del JWT, excluye CANCELADAS y devuelve el nombre del paciente', async () => {
    const res = await service.buscarCitasParaLigar(TENANT_A, {});

    expect(qb.where).toHaveBeenCalledWith('cita."tenantId" = :tenantId', { tenantId: TENANT_A });
    expect(qb.andWhere).toHaveBeenCalledWith('cita.estado != :cancelada', { cancelada: 'CANCELADA' });
    expect(res).toEqual([
      expect.objectContaining({ id: 'c1', pacienteNombre: 'Ana López' }),
      expect.objectContaining({ id: 'c2', pacienteNombre: null }),
    ]);
  });

  it('sin from/to: el rango por default es el día de hoy', async () => {
    await service.buscarCitasParaLigar(TENANT_A, {});
    const [, params] = qb.andWhere.mock.calls.find(([sql]) => String(sql).includes('BETWEEN'))!;
    const hoy = new Date();
    expect(params.from.toDateString()).toBe(hoy.toDateString());
    expect(params.to.toDateString()).toBe(hoy.toDateString());
    expect(params.from.getTime()).toBeLessThan(params.to.getTime());
  });

  it('con from/to usa ese rango, y con paciente agrega el filtro por nombre (ILIKE)', async () => {
    await service.buscarCitasParaLigar(TENANT_A, { from: '2026-10-01T00:00:00Z', to: '2026-10-02T00:00:00Z', paciente: '  ana ' });
    const [, params] = qb.andWhere.mock.calls.find(([sql]) => String(sql).includes('BETWEEN'))!;
    expect(params.from.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(params.to.toISOString()).toBe('2026-10-02T00:00:00.000Z');
    expect(qb.andWhere).toHaveBeenCalledWith('patient.nombre ILIKE :paciente', { paciente: '%ana%' });
  });

  it('sin filtro de paciente no agrega la condición por nombre', async () => {
    await service.buscarCitasParaLigar(TENANT_A, {});
    expect(condiciones().some((c) => c.includes('ILIKE'))).toBe(false);
  });

  it('el join con Patient también está atado al tenant de la cita', async () => {
    await appointments.searchForPos(TENANT_A, {});
    const [, , cond] = qb.leftJoin.mock.calls[0];
    expect(cond).toContain('patient."tenantId" = cita."tenantId"');
  });

  it('capacidad INACTIVA: 403, no consulta ninguna cita', async () => {
    hasPosCapability.mockResolvedValue(false);
    await expect(service.buscarCitasParaLigar(TENANT_A, {})).rejects.toThrow(ForbiddenException);
    expect(qb.where).not.toHaveBeenCalled();
  });

  it('sin tenant en el JWT: 403', async () => {
    await expect(service.buscarCitasParaLigar(undefined, {})).rejects.toThrow(ForbiddenException);
  });

  it('from/to inválidos: 400', async () => {
    await expect(service.buscarCitasParaLigar(TENANT_A, { from: 'no-es-fecha' })).rejects.toThrow(BadRequestException);
  });
});

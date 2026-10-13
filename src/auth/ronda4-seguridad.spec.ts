import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CostsController } from '../costs/costs.controller';
import { HrController } from '../hr/hr.controller';
import { PayrollController } from '../payroll/payroll.controller';
import { DashboardController } from '../dashboard/dashboard.controller';
import { esViolacionTurnoUnico, INDICE_TURNO_UNICO, ShiftsService } from '../pos/shifts.service';

const MIO = 'tenant-mio';
const OTRO = 'tenant-otro';
const req = (roleCode: string, tenantId: string | null, extra: any = {}) => ({ user: { roleCode, tenantId, ...extra } });

describe('turno único por cajero: el error de unicidad se traduce a 400', () => {
  const datos = { cajero: 'c1', sucursalId: 's1', tenantId: MIO, fondoInicial: 0 };
  const servicio = (save: jest.Mock) => {
    const shiftsRepo: any = { create: jest.fn(() => ({})), save };
    return new ShiftsService(shiftsRepo, {} as any);
  };
  const violacion = (extra: any = {}) => Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505', constraint: INDICE_TURNO_UNICO, ...extra });

  it('23505 del índice parcial -> 400 con el mensaje pedido', async () => {
    const svc = servicio(jest.fn().mockRejectedValue(violacion()));
    await expect(svc.openShift(datos)).rejects.toThrow(BadRequestException);
    await expect(svc.openShift(datos)).rejects.toThrow('Ya tienes un turno abierto. Ciérralo antes de abrir otro');
  });

  it('también cuando TypeORM envuelve el error del driver (QueryFailedError.driverError)', async () => {
    const envuelto = Object.assign(new Error('QueryFailedError'), { driverError: { code: '23505', constraint: INDICE_TURNO_UNICO } });
    await expect(servicio(jest.fn().mockRejectedValue(envuelto)).openShift(datos)).rejects.toThrow(BadRequestException);
  });

  it('otro error de BD no se disfraza de "turno abierto"', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const svc = servicio(jest.fn().mockRejectedValue(Object.assign(new Error('boom'), { code: '08006' })));
    const err = await svc.openShift(datos).catch((e) => e);
    expect(err).not.toBeInstanceOf(BadRequestException);
    expect(String(err.message)).toContain('Error al abrir turno');
  });

  it('una unicidad de otra tabla no se confunde', () => {
    expect(esViolacionTurnoUnico({ code: '23505', constraint: 'UQ_otra', table: 'user' })).toBe(false);
    expect(esViolacionTurnoUnico({ code: '23505', constraint: INDICE_TURNO_UNICO })).toBe(true);
    expect(esViolacionTurnoUnico(null)).toBe(false);
  });

  it('abrir sin conflicto guarda el turno', async () => {
    const save = jest.fn().mockImplementation(async (s: any) => ({ ...s, id: 't1' }));
    const r: any = await servicio(save).openShift(datos);
    expect(r.id).toBe('t1');
    expect(r.status).toBe('ABIERTO');
  });
});

describe('GET /dashboard/kpis: el x-company-id debe ser del tenant del token', () => {
  const empresas = [{ id: 'e-mia', tenantId: MIO }, { id: 'e-ajena', tenantId: OTRO }];
  let repo: any;
  let dash: any;
  let ctrl: DashboardController;
  beforeEach(() => {
    repo = {
      findOne: jest.fn(({ where }: any) => Promise.resolve(empresas.find((e) => Object.entries(where).every(([k, v]) => (e as any)[k] === v)) ?? null)),
      manager: { query: jest.fn().mockResolvedValue([{ x: 1 }]) },
    };
    dash = { getKpis: jest.fn().mockResolvedValue({ ok: 1 }) };
    ctrl = new DashboardController(dash, repo);
  });

  it('empresa de otro tenant en el header -> 404 y no calcula', async () => {
    await expect(ctrl.getKpis('month', undefined, 'e-ajena', undefined, req('ADMIN', MIO))).rejects.toThrow(NotFoundException);
    expect(dash.getKpis).not.toHaveBeenCalled();
  });

  it('empresa propia en el header -> calcula con el tenant del token', async () => {
    await ctrl.getKpis('month', undefined, 'e-mia', undefined, req('ADMIN', MIO));
    expect(dash.getKpis).toHaveBeenCalledWith('month', undefined, 'e-mia', MIO);
  });

  it('empresa inexistente -> 404 (igual que una ajena)', async () => {
    await expect(ctrl.getKpis('month', undefined, 'no-existe', undefined, req('ADMIN', MIO))).rejects.toThrow(NotFoundException);
  });

  it('sin header usa la empresa del token', async () => {
    await ctrl.getKpis('month', undefined, undefined, undefined, req('ADMIN', MIO, { companyId: 'e-mia' }));
    expect(dash.getKpis.mock.calls[0][2]).toBe('e-mia');
  });
});

describe('costs: el tenant sale del token (solo SOPORTE puede indicar otro)', () => {
  let svc: any;
  let ctrl: CostsController;
  beforeEach(() => {
    svc = new Proxy({}, { get: (t: any, k: string) => (t[k] ??= jest.fn().mockResolvedValue([])) });
    ctrl = new CostsController(svc);
  });

  it.each([
    ['findInventoryByPeriod', (c: CostsController, r: any) => c.findInventoryByPeriod(OTRO, '2026-10', r), 'findInventoryByPeriod'],
    ['calculateCostOfSales', (c: CostsController, r: any) => c.calculateCostOfSales(OTRO, '2026-10', r), 'calculateCostOfSales'],
    ['findPhysicalCounts', (c: CostsController, r: any) => c.findPhysicalCounts(OTRO, undefined, r), 'findPhysicalCounts'],
  ])('%s: ?tenantId= ajeno se ignora para un ADMIN', async (_n, llamar, metodo) => {
    await llamar(ctrl, req('ADMIN', MIO));
    expect(svc[metodo].mock.calls[0][0]).toBe(MIO);
  });

  it('findPhysicalCountsByPeriod usa el tenant del token', async () => {
    await ctrl.findPhysicalCountsByPeriod('2026-10-01', '2026-10-31', OTRO, req('GERENTE', MIO));
    expect(svc.findPhysicalCountsByPeriod.mock.calls[0][2]).toBe(MIO);
  });

  it('SOPORTE sí puede indicar el tenant por query', async () => {
    await ctrl.findInventoryByPeriod(OTRO, '2026-10', req('SOPORTE', null));
    expect(svc.findInventoryByPeriod.mock.calls[0][0]).toBe(OTRO);
  });

  it('un usuario no SOPORTE sin tenant en el token es 403 (antes caía al query)', () => {
    expect(() => ctrl.findAllInsumos(OTRO, undefined, req('ADMIN', null))).toThrow(ForbiddenException);
  });

  it('createInventory: el tenantId del body se pisa con el del token', async () => {
    await ctrl.createInventory({ insumoId: 'i', tenantId: OTRO }, req('ADMIN', MIO));
    expect(svc.createInventory.mock.calls[0][0].tenantId).toBe(MIO);
  });

  it('createInsumo/createAlmacen con tenantId en el body: gana el del token', async () => {
    await ctrl.createInsumo({ nombre: 'x', tenantId: OTRO }, req('ADMIN', MIO));
    expect(svc.createInsumo.mock.calls[0][0].tenantId).toBe(MIO);
  });
});

describe('hr y payroll: el header x-tenant-id solo vale para SOPORTE', () => {
  it('hr: GET employees con x-tenant-id ajeno usa el tenant del token', async () => {
    const service: any = { findAllEmployees: jest.fn().mockResolvedValue([]) };
    await new HrController(service).findAll(OTRO, undefined, req('ADMIN', MIO));
    expect(service.findAllEmployees.mock.calls[0][0]).toBe(MIO);
  });

  it('hr: SOPORTE puede indicar el tenant por header', async () => {
    const service: any = { findAllEmployees: jest.fn().mockResolvedValue([]) };
    await new HrController(service).findAll(OTRO, undefined, req('SOPORTE', null));
    expect(service.findAllEmployees.mock.calls[0][0]).toBe(OTRO);
  });

  it('hr: sin tenant en el token y no SOPORTE es 403 (antes se confiaba en el header)', () => {
    const service: any = { findAllEmployees: jest.fn() };
    expect(() => new HrController(service).findAll(OTRO, undefined, req('ADMIN', null))).toThrow(ForbiddenException);
    expect(service.findAllEmployees).not.toHaveBeenCalled();
  });

  it('hr: crear empleado con header ajeno guarda el tenant del token', async () => {
    const service: any = { createEmployee: jest.fn().mockResolvedValue({}) };
    await new HrController(service).create({ nombre: 'x', tenantId: OTRO }, OTRO, undefined, req('ADMIN', MIO));
    expect(service.createEmployee.mock.calls[0][0].tenantId).toBe(MIO);
  });

  it('hr: verifyFace ignora body.tenantId para un usuario de tenant', async () => {
    const service: any = { verifyFace: jest.fn().mockResolvedValue({}) };
    await new HrController(service).verifyFace({ faceDescriptor: [1], tenantId: OTRO }, req('ADMIN', MIO));
    expect(service.verifyFace.mock.calls[0][1]).toBe(MIO);
  });

  it('payroll: crear corrida con x-tenant-id ajeno usa el tenant del token', async () => {
    const payroll: any = { createPayrollRun: jest.fn().mockResolvedValue({}) };
    await new PayrollController(payroll).createPayrollRun({ periodStart: 'a', periodEnd: 'b' }, OTRO, undefined, req('ADMIN', MIO));
    expect(payroll.createPayrollRun.mock.calls[0][1]).toBe(MIO);
  });

  it('payroll: catálogo con header ajeno usa el del token; sin tenant es 403', () => {
    const payroll: any = { getCatalog: jest.fn().mockResolvedValue([]) };
    const ctrl = new PayrollController(payroll);
    ctrl.getCatalog(req('ADMIN', MIO), OTRO);
    expect(payroll.getCatalog.mock.calls[0][0]).toBe(MIO);
    expect(() => ctrl.getCatalog(req('ADMIN', null), OTRO)).toThrow(ForbiddenException);
  });
});

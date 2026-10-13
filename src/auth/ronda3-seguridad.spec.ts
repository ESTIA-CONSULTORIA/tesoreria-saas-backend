import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { TenantsController } from '../tenants/tenants.controller';
import { CompaniesController } from '../companies/companies.controller';
import { DashboardController } from '../dashboard/dashboard.controller';
import { PurchasesService } from '../purchases/purchases.service';
import { AdministrationController } from '../administration/administration.controller';

const MIO = 'tenant-mio';
const OTRO = 'tenant-otro';
const req = (roleCode: string, tenantId: string | null) => ({ user: { roleCode, tenantId } });
const ctx = (controller: any, metodo: string, user: any) =>
  ({
    getHandler: () => controller.prototype[metodo],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as any;

describe('PATCH /tenants/:id/onboard: ADMIN y GERENTE solo de su propio tenant', () => {
  const guard = new RolesGuard(new Reflector());
  const servicio: any = { markOnboarded: jest.fn().mockResolvedValue({ ok: true }) };
  const ctrl = new TenantsController(servicio);
  beforeEach(() => servicio.markOnboarded.mockClear());

  it('un GERENTE pasa el guard de roles y marca su propio tenant', async () => {
    expect(guard.canActivate(ctx(TenantsController, 'markOnboarded', { roleCode: 'GERENTE', tenantId: MIO }))).toBe(true);
    await ctrl.markOnboarded(MIO, req('GERENTE', MIO));
    expect(servicio.markOnboarded).toHaveBeenCalledWith(MIO);
  });

  it('un GERENTE de otro tenant recibe 403 y no escribe', () => {
    expect(() => ctrl.markOnboarded(MIO, req('GERENTE', OTRO))).toThrow(ForbiddenException);
    expect(servicio.markOnboarded).not.toHaveBeenCalled();
  });

  it('un CAJERO sigue sin poder (403 del guard)', () => {
    expect(() => guard.canActivate(ctx(TenantsController, 'markOnboarded', { roleCode: 'CAJERO', tenantId: MIO }))).toThrow(ForbiddenException);
  });
});

describe('GET /companies: solo SOPORTE ve todas', () => {
  const servicio: any = {
    findAll: jest.fn().mockResolvedValue(['todas']),
    findByTenant: jest.fn().mockResolvedValue(['las-mias']),
  };
  const ctrl = new CompaniesController(servicio);
  beforeEach(() => jest.clearAllMocks());

  it('un ADMIN/CAJERO ve solo las de su tenant', async () => {
    expect(await ctrl.findAll(req('ADMIN', MIO))).toEqual(['las-mias']);
    expect(servicio.findByTenant).toHaveBeenCalledWith(MIO);
    expect(servicio.findAll).not.toHaveBeenCalled();
  });

  it('SOPORTE ve todas, aunque su token traiga un tenant', async () => {
    expect(await ctrl.findAll(req('SOPORTE', MIO))).toEqual(['todas']);
    expect(servicio.findAll).toHaveBeenCalled();
  });

  it('un usuario no SOPORTE sin tenant en el token es 403 (antes recibía todas)', () => {
    expect(() => ctrl.findAll(req('ADMIN', null))).toThrow(ForbiddenException);
    expect(servicio.findAll).not.toHaveBeenCalled();
  });
});

describe('GET /dashboard/company/:companyId/kpis', () => {
  const empresas = [{ id: 'e-mia', tenantId: MIO }, { id: 'e-ajena', tenantId: OTRO }];
  let repo: any;
  let dash: any;
  let ctrl: DashboardController;

  beforeEach(() => {
    repo = {
      findOne: jest.fn(({ where }: any) => Promise.resolve(empresas.find((e) => Object.entries(where).every(([k, v]) => (e as any)[k] === v)) ?? null)),
    };
    dash = { getCompanyKpis: jest.fn().mockResolvedValue({ ok: 1 }), getKpis: jest.fn().mockResolvedValue({ ok: 1 }) };
    ctrl = new DashboardController(dash, repo);
  });

  it('la empresa de otro tenant es 404 y no calcula nada', async () => {
    await expect(ctrl.getCompanyKpis('e-ajena', 'month', undefined, req('ADMIN', MIO))).rejects.toThrow(NotFoundException);
    expect(dash.getCompanyKpis).not.toHaveBeenCalled();
  });

  it('la propia empresa se calcula con el tenant del token (el header x-tenant-id se ignora)', async () => {
    await ctrl.getCompanyKpis('e-mia', 'month', OTRO, req('ADMIN', MIO));
    expect(dash.getCompanyKpis).toHaveBeenCalledWith('e-mia', 'month', MIO);
  });

  it('nunca busca "la primera empresa" de la BD: siempre consulta por id', async () => {
    await ctrl.getCompanyKpis('e-mia', 'month', undefined, req('ADMIN', MIO));
    for (const [arg] of repo.findOne.mock.calls) expect(arg.where.id).toBe('e-mia');
  });

  it('sin tenant en el token y no SOPORTE es 403', async () => {
    await expect(ctrl.getCompanyKpis('e-mia', 'month', undefined, req('ADMIN', null))).rejects.toThrow(ForbiddenException);
    expect(dash.getCompanyKpis).not.toHaveBeenCalled();
  });

  it('SOPORTE opera con el tenant de la empresa pedida; una empresa inexistente es 404', async () => {
    await ctrl.getCompanyKpis('e-ajena', 'month', undefined, req('SOPORTE', null));
    expect(dash.getCompanyKpis).toHaveBeenCalledWith('e-ajena', 'month', OTRO);
    await expect(ctrl.getCompanyKpis('no-existe', 'month', undefined, req('SOPORTE', null))).rejects.toThrow(NotFoundException);
  });

  it('GET /dashboard/kpis ya no cae al tenant de la primera empresa', async () => {
    await ctrl.getKpis('month', undefined, undefined, undefined, req('ADMIN', MIO));
    expect(dash.getKpis.mock.calls[0][3]).toBe(MIO);
    expect(repo.findOne).not.toHaveBeenCalled();
    dash.getKpis.mockClear();
    await ctrl.getKpis('month', undefined, undefined, undefined, req('SOPORTE', null));
    expect(dash.getKpis.mock.calls[0][3]).toBeUndefined();
    expect(repo.findOne).not.toHaveBeenCalled();
  });
});

describe('registerPayment: la cuenta del pago debe ser del tenant de la factura', () => {
  const factura = { id: 'f-mia', tenantId: MIO, numero: 'F-1', total: 100, montoPagado: 0 };
  let movimientos: any;
  let facRepo: any;
  let svc: PurchasesService;

  beforeEach(() => {
    movimientos = { create: jest.fn().mockResolvedValue({}) };
    facRepo = {
      findOne: jest.fn().mockResolvedValue(factura),
      update: jest.fn().mockResolvedValue(undefined),
    };
    svc = new PurchasesService({} as any, facRepo, movimientos, {} as any, {} as any);
  });

  const pago = { amount: 10, accountId: 'cuenta-x', fechaPago: '2026-10-12', userId: 'u1' };

  it('pasa el tenant de la factura al movimiento (cuenta acotada por tenant)', async () => {
    await svc.registerPayment('f-mia', pago, MIO);
    expect(movimientos.create.mock.calls[0][7]).toBe(MIO);
  });

  it('una cuenta de otro tenant responde 400 "Cuenta no encontrada" y no actualiza la factura', async () => {
    movimientos.create.mockRejectedValue(new BadRequestException('Cuenta no encontrada'));
    await expect(svc.registerPayment('f-mia', pago, MIO)).rejects.toThrow(BadRequestException);
    expect(facRepo.update).not.toHaveBeenCalled();
  });
});

describe('POST /administration/audit-logs: el tenantId del body solo vale para SOPORTE', () => {
  const servicio: any = { createAuditLog: jest.fn().mockResolvedValue({}) };
  const ctrl = new AdministrationController(servicio, {} as any);
  const body: any = { userId: 'u', userEmail: 'e', tenantId: OTRO, action: 'A', entity: 'E', ipAddress: 'i', userAgent: 'ua' };
  beforeEach(() => servicio.createAuditLog.mockClear());

  it('SOPORTE puede registrar en el tenant del body', async () => {
    await ctrl.createAuditLog(req('SOPORTE', null), body);
    expect(servicio.createAuditLog.mock.calls[0][0].tenantId).toBe(OTRO);
  });

  it('cualquier otro rol registra con el tenant de su token', async () => {
    await ctrl.createAuditLog(req('ADMIN', MIO), body);
    expect(servicio.createAuditLog.mock.calls[0][0].tenantId).toBe(MIO);
  });
});

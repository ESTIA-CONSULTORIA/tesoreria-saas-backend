import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AccountsController } from '../accounts/accounts.controller';
import { AccountsService } from '../accounts/accounts.service';
import { PurchasesService } from '../purchases/purchases.service';
import { PurchasesController } from '../purchases/purchases.controller';
import { SuppliersService } from '../suppliers/suppliers.service';
import { SuppliersController } from '../suppliers/suppliers.controller';
import { OcrService } from '../ocr/ocr.service';
import { PatientsService } from '../patients/patients.service';
import { InsumoAlertsService } from '../pos/insumo-alerts.service';
import { CostsController } from '../costs/costs.controller';

// Barrido de IDOR (ESTADO-SISTEMA, sección "controllers sin @Roles/filtro de tenant"): toda operación por id se acota
// al tenant del TOKEN. Una id de otro tenant responde 404 (o 403 en sucursal) y NUNCA escribe.
const MIO = 'tenant-mio';
const OTRO = 'tenant-otro';
const user = (roleCode: string, tenantId: string | null) => ({ user: { roleCode, tenantId } });

// Repositorio doble: solo "encuentra" la fila si coincide id y (cuando se pide) tenantId.
function repoDoble(filas: any[]) {
  return {
    findOne: jest.fn(({ where }: any) => Promise.resolve(filas.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null)),
    find: jest.fn().mockResolvedValue(filas),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    save: jest.fn((x: any) => Promise.resolve(x)),
    create: jest.fn((x: any) => x),
    manager: { query: jest.fn().mockResolvedValue([]) },
  };
}

describe('accounts (C4): el tenant sale de branch → company', () => {
  it('GET /accounts: un CAJERO consulta acotado a su tenant; SOPORTE sin acotar', async () => {
    const servicio = { findAll: jest.fn().mockResolvedValue([]), create: jest.fn(), findByBranch: jest.fn() } as any;
    const ctrl = new AccountsController(servicio);
    await ctrl.findAll(user('CAJERO', MIO));
    expect(servicio.findAll).toHaveBeenCalledWith(MIO);
    await ctrl.findAll(user('SOPORTE', null));
    expect(servicio.findAll).toHaveBeenLastCalledWith(undefined);
  });

  it('sin tenant en el token (y no SOPORTE) es 403', () => {
    const ctrl = new AccountsController({ findAll: jest.fn() } as any);
    expect(() => ctrl.findAll(user('ADMIN', null))).toThrow(ForbiddenException);
  });

  it('POST /accounts con una sucursal de otro tenant es 403 y no guarda', async () => {
    const repo = repoDoble([]);
    repo.manager.query.mockResolvedValue([]); // la sucursal no pertenece al tenant
    const servicio = new AccountsService(repo as any);
    await expect(servicio.create('sucursal-ajena', 'Caja', 'CASH', 'MXN', MIO)).rejects.toThrow(ForbiddenException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('POST /accounts con sucursal propia guarda', async () => {
    const repo = repoDoble([]);
    repo.manager.query.mockResolvedValue([{ '?column?': 1 }]);
    const servicio = new AccountsService(repo as any);
    await servicio.create('sucursal-mia', 'Caja', 'CASH', 'MXN', MIO);
    expect(repo.save).toHaveBeenCalled();
  });

  it('GET /accounts/branch/:id de otro tenant es 403', async () => {
    const repo = repoDoble([]);
    repo.manager.query.mockResolvedValue([]);
    await expect(new AccountsService(repo as any).findByBranch('sucursal-ajena', MIO)).rejects.toThrow(ForbiddenException);
    expect(repo.find).not.toHaveBeenCalled();
  });
});

describe('compras: órdenes y facturas por id', () => {
  const ordenes = [{ id: 'o-mia', tenantId: MIO, status: 'BORRADOR', items: [] }, { id: 'o-ajena', tenantId: OTRO, status: 'BORRADOR', items: [] }];
  const facturas = [{ id: 'f-mia', tenantId: MIO }, { id: 'f-ajena', tenantId: OTRO, total: 10, montoPagado: 0 }];
  let ordRepo: any;
  let facRepo: any;
  let svc: PurchasesService;

  beforeEach(() => {
    ordRepo = repoDoble(ordenes);
    facRepo = repoDoble(facturas);
    svc = new PurchasesService(ordRepo, facRepo, {} as any, {} as any, {} as any);
  });

  it.each([
    ['findOneOrder', (s: PurchasesService) => s.findOneOrder('o-ajena', MIO)],
    ['updateOrder', (s: PurchasesService) => s.updateOrder('o-ajena', { status: 'X' } as any, MIO)],
    ['markOrderAsSent', (s: PurchasesService) => s.markOrderAsSent('o-ajena', MIO)],
    ['cancelOrder', (s: PurchasesService) => s.cancelOrder('o-ajena', MIO)],
    ['requestCancellation', (s: PurchasesService) => s.requestCancellation('o-ajena', 'm', 'u', MIO)],
    ['approveCancellation', (s: PurchasesService) => s.approveCancellation('o-ajena', 'u', MIO)],
    ['receiveOrder', (s: PurchasesService) => s.receiveOrder('o-ajena', [], MIO)],
    ['deleteOrder', (s: PurchasesService) => s.deleteOrder('o-ajena', MIO)],
  ])('%s con una orden de otro tenant es 404 y no escribe', async (_n, op) => {
    await expect(op(svc)).rejects.toThrow(NotFoundException);
    expect(ordRepo.update).not.toHaveBeenCalled();
    expect(ordRepo.delete).not.toHaveBeenCalled();
  });

  it.each([
    ['findOnePurchase', (s: PurchasesService) => s.findOnePurchase('f-ajena', MIO)],
    ['updatePurchase', (s: PurchasesService) => s.updatePurchase('f-ajena', { total: 1 } as any, MIO)],
    ['deletePurchase', (s: PurchasesService) => s.deletePurchase('f-ajena', MIO)],
    ['registerPayment', (s: PurchasesService) => s.registerPayment('f-ajena', { amount: 1, accountId: 'a', fechaPago: '2026-01-01', userId: 'u' }, MIO)],
  ])('%s con una factura de otro tenant es 404 y no escribe', async (_n, op) => {
    await expect(op(svc)).rejects.toThrow(NotFoundException);
    expect(facRepo.update).not.toHaveBeenCalled();
    expect(facRepo.delete).not.toHaveBeenCalled();
  });

  it('una orden propia sí se opera, y SOPORTE (sin tenantId) opera cualquiera', async () => {
    await svc.markOrderAsSent('o-mia', MIO);
    expect(ordRepo.update).toHaveBeenCalledWith('o-mia', { status: 'ENVIADA' });
    await svc.markOrderAsSent('o-ajena', undefined);
    expect(ordRepo.update).toHaveBeenCalledWith('o-ajena', { status: 'ENVIADA' });
  });

  it('el body no puede reasignar el tenant de una orden/factura', async () => {
    const data: any = { tenantId: OTRO, status: 'ENVIADA' };
    await svc.updateOrder('o-mia', data, MIO);
    expect(ordRepo.update.mock.calls[0][1].tenantId).toBeUndefined();
  });

  it('GET /purchases/invoices y accounts-payable usan el tenant del token, no el query', async () => {
    const servicio = { findAllPurchases: jest.fn().mockResolvedValue([]), getAccountsPayable: jest.fn().mockResolvedValue([]) } as any;
    const ctrl = new PurchasesController(servicio);
    await ctrl.findAllPurchases(OTRO, undefined, undefined, user('ADMIN', MIO));
    expect(servicio.findAllPurchases).toHaveBeenCalledWith(MIO, undefined, undefined);
    await ctrl.getAccountsPayable(OTRO, undefined, user('ADMIN', MIO));
    expect(servicio.getAccountsPayable).toHaveBeenCalledWith(MIO, undefined);
    // SOPORTE: el query sí vale
    await ctrl.findAllPurchases(OTRO, undefined, undefined, user('SOPORTE', null));
    expect(servicio.findAllPurchases).toHaveBeenLastCalledWith(OTRO, undefined, undefined);
  });
});

describe('proveedores por id', () => {
  const filas = [{ id: 'p-mio', tenantId: MIO }, { id: 'p-ajeno', tenantId: OTRO }];
  let repo: any;
  let svc: SuppliersService;
  beforeEach(() => {
    repo = repoDoble(filas);
    svc = new SuppliersService(repo, {} as any);
  });

  it.each([
    ['findOne', (s: SuppliersService) => s.findOne('p-ajeno', MIO)],
    ['update', (s: SuppliersService) => s.update('p-ajeno', { nombre: 'x' } as any, MIO)],
    ['softDelete', (s: SuppliersService) => s.softDelete('p-ajeno', MIO)],
    ['delete', (s: SuppliersService) => s.delete('p-ajeno', MIO)],
  ])('%s de un proveedor de otro tenant es 404 y no escribe', async (_n, op) => {
    await expect(op(svc)).rejects.toThrow(NotFoundException);
    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('el controller pasa el tenant del token (un CAJERO de otro tenant no borra)', async () => {
    const ctrl = new SuppliersController({ delete: jest.fn().mockResolvedValue(undefined) } as any);
    await ctrl.delete('p-ajeno', user('CAJERO', MIO));
    expect((ctrl as any).suppliersService.delete).toHaveBeenCalledWith('p-ajeno', MIO);
  });
});

describe('OCR, consultas y alertas de insumo por id', () => {
  it('OCR: documento de otro tenant es 404 en get/validate/reject/delete', async () => {
    const repo = repoDoble([{ id: 'd-ajeno', tenantId: OTRO }]);
    const svc = new OcrService(repo as any);
    await expect(svc.findOne('d-ajeno', MIO)).rejects.toThrow(NotFoundException);
    await expect(svc.validate('d-ajeno', {}, 'x', MIO)).rejects.toThrow(NotFoundException);
    await expect(svc.reject('d-ajeno', 'x', MIO)).rejects.toThrow(NotFoundException);
    await expect(svc.remove('d-ajeno', MIO)).rejects.toThrow(NotFoundException);
    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('consultas: PUT de una consulta de otro tenant es 404 y no escribe', async () => {
    const repo = repoDoble([{ id: 'c-ajena', tenantId: OTRO }]);
    const svc = new PatientsService({} as any, repo as any);
    await expect(svc.updateConsulta('c-ajena', { pagado: 0 } as any, MIO)).rejects.toThrow(NotFoundException);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('alertas de insumo: PUT de una alerta de otro tenant es 404 y no guarda', async () => {
    const repo = repoDoble([{ id: 'a-ajena', tenantId: OTRO, estado: 'ABIERTA' }]);
    const svc = new InsumoAlertsService(repo as any, {} as any);
    await expect(svc.updateEstado('a-ajena', 'CERRADA', undefined, MIO)).rejects.toThrow(NotFoundException);
    expect(repo.save).not.toHaveBeenCalled();
  });
});

describe('costos: justificables', () => {
  it('GET usa el tenant del token (antes sin ?tenantId devolvía todos) y POST no acepta tenantId ajeno', async () => {
    const servicio = {
      findJustificablesByPeriod: jest.fn().mockResolvedValue([]),
      calculateTotalJustificables: jest.fn().mockResolvedValue({}),
      createJustifiable: jest.fn().mockResolvedValue({}),
    } as any;
    const ctrl = new CostsController(servicio);
    await ctrl.findJustificablesByPeriod('2026-10', OTRO, user('ADMIN', MIO));
    expect(servicio.findJustificablesByPeriod).toHaveBeenCalledWith('2026-10', MIO);
    await ctrl.calculateTotalJustificables('2026-10', undefined, user('ADMIN', MIO));
    expect(servicio.calculateTotalJustificables).toHaveBeenCalledWith('2026-10', MIO);
    await ctrl.createJustifiable({ periodo: '2026-10', tenantId: OTRO, monto: 1 }, user('ADMIN', MIO));
    expect(servicio.createJustifiable.mock.calls[0][0].tenantId).toBe(MIO);
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  ActorMesas,
  contextoCobro,
  puedeCobrar,
  puedeDividir,
  PoliticaCobro,
  PoliticaDivision,
  POLITICAS_COBRO,
  POLITICAS_DIVISION,
} from './politicas-pos.config';
import { TenantSettingsService } from '../tenant-settings/tenant-settings.service';
import { TenantSettingsController } from '../tenant-settings/tenant-settings.controller';
import { TenantSetting } from '../tenant-settings/entities/tenant-setting.entity';
import { ROLES_KEY } from '../auth/roles.decorator';
import { SalesService } from '../pos/sales.service';
import { Sale } from '../pos/entities/sale.entity';
import { Product } from '../pos/entities/product.entity';
import { Recipe } from '../costs/entities/recipe.entity';
import { Insumo } from '../costs/entities/insumo.entity';
import { InsumoAlertsService } from '../pos/insumo-alerts.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { CostsService } from '../costs/costs.service';

// Reglas de rol de las cuentas de mesa. "Caja" = sesión ERP con ADMIN, GERENTE o CAJERO; todo lo demás (sesión
// POS Lite, o ERP con MESERO/CAPITAN) es "mesa".
const erp = (roleCode?: string): ActorMesas => ({ id: `u-${roleCode}`, email: `${roleCode}@x`, roleCode, posLiteAccess: false });
const lite = (roleCode?: string): ActorMesas => ({ id: `u-${roleCode}`, email: `${roleCode}@x`, roleCode, posLiteAccess: true });

describe('contexto: caja o mesa', () => {
  it.each(['ADMIN', 'GERENTE', 'CAJERO'])('sesión ERP %s = CAJA (un gerente en tableta con sesión ERP cuenta como caja)', (rol) => {
    expect(contextoCobro(erp(rol))).toBe('CAJA');
  });
  it.each(['MESERO', 'CAPITAN', 'CONTADOR', undefined])('sesión ERP %s = MESA (un mesero con sesión ERP no se salta la política)', (rol) => {
    expect(contextoCobro(erp(rol))).toBe('MESA');
  });
  it.each(['CAJERO', 'MESERO', 'CAPITAN', 'GERENTE', 'ADMIN'])('sesión POS Lite %s = MESA, siempre', (rol) => {
    expect(contextoCobro(lite(rol))).toBe('MESA');
  });
  it('sin usuario = MESA', () => {
    expect(contextoCobro(undefined)).toBe('MESA');
  });
});

describe('puedeCobrar() — cobro completo, cada política con cada rol', () => {
  // [rol, contexto] → permitido por política
  const casos: Array<[string, 'erp' | 'lite', Record<PoliticaCobro, boolean>]> = [
    ['ADMIN', 'erp', { SOLO_CAJA: true, GERENTE_EN_MESA: true, MESERO_EN_MESA: true }],
    ['GERENTE', 'erp', { SOLO_CAJA: true, GERENTE_EN_MESA: true, MESERO_EN_MESA: true }],
    ['CAJERO', 'erp', { SOLO_CAJA: true, GERENTE_EN_MESA: true, MESERO_EN_MESA: true }],
    ['CAPITAN', 'erp', { SOLO_CAJA: false, GERENTE_EN_MESA: true, MESERO_EN_MESA: true }],
    ['MESERO', 'erp', { SOLO_CAJA: false, GERENTE_EN_MESA: false, MESERO_EN_MESA: true }],
    // sesión POS Lite: siempre mesa
    ['CAJERO', 'lite', { SOLO_CAJA: false, GERENTE_EN_MESA: false, MESERO_EN_MESA: false }],
    ['CAPITAN', 'lite', { SOLO_CAJA: false, GERENTE_EN_MESA: true, MESERO_EN_MESA: true }],
    ['MESERO', 'lite', { SOLO_CAJA: false, GERENTE_EN_MESA: false, MESERO_EN_MESA: true }],
  ];
  for (const [rol, sesion, esperado] of casos) {
    for (const politica of POLITICAS_COBRO) {
      it(`${rol} (${sesion}) con ${politica}: ${esperado[politica] ? 'puede' : 'NO puede'}`, () => {
        const actor = sesion === 'erp' ? erp(rol) : lite(rol);
        expect(puedeCobrar(actor, politica)).toBe(esperado[politica]);
      });
    }
  }
  it('sin usuario o con un rol desconocido: nunca desde mesa', () => {
    for (const p of POLITICAS_COBRO) {
      expect(puedeCobrar(undefined, p)).toBe(false);
      expect(puedeCobrar(erp('VIEWER'), p)).toBe(false);
    }
  });
});

describe('puedeDividir() — cada política de división con cada rol (en caja y en mesa)', () => {
  const dividir = (actor: ActorMesas, cobro: PoliticaCobro, division: PoliticaDivision) => puedeDividir(actor, cobro, division);

  it('GERENTE_CAPITAN_CAJERO (default): gerente, capitán, cajero y ADMIN; el mesero no', () => {
    const d: PoliticaDivision = 'GERENTE_CAPITAN_CAJERO';
    expect(dividir(erp('ADMIN'), 'SOLO_CAJA', d)).toBe(true);
    expect(dividir(erp('GERENTE'), 'SOLO_CAJA', d)).toBe(true);
    expect(dividir(erp('CAJERO'), 'SOLO_CAJA', d)).toBe(true);
    expect(dividir(lite('CAPITAN'), 'GERENTE_EN_MESA', d)).toBe(true);
    expect(dividir(lite('MESERO'), 'MESERO_EN_MESA', d)).toBe(false); // puede cobrar completo pero no dividir
    expect(dividir(erp('MESERO'), 'MESERO_EN_MESA', d)).toBe(false);
  });

  it('SOLO_GERENTE: gerente y ADMIN; ni cajero ni capitán ni mesero', () => {
    const d: PoliticaDivision = 'SOLO_GERENTE';
    expect(dividir(erp('ADMIN'), 'SOLO_CAJA', d)).toBe(true);
    expect(dividir(erp('GERENTE'), 'SOLO_CAJA', d)).toBe(true);
    expect(dividir(erp('CAJERO'), 'SOLO_CAJA', d)).toBe(false);
    expect(dividir(lite('CAPITAN'), 'GERENTE_EN_MESA', d)).toBe(false);
    expect(dividir(lite('MESERO'), 'MESERO_EN_MESA', d)).toBe(false);
  });

  it('TODOS: cualquiera que pueda cobrar, incluido el mesero cuando la política de cobro lo permite', () => {
    const d: PoliticaDivision = 'TODOS';
    expect(dividir(lite('MESERO'), 'MESERO_EN_MESA', d)).toBe(true);
    expect(dividir(erp('CAJERO'), 'SOLO_CAJA', d)).toBe(true);
    // TODOS no da permiso de cobrar: el mesero con SOLO_CAJA o GERENTE_EN_MESA sigue sin poder
    expect(dividir(lite('MESERO'), 'SOLO_CAJA', d)).toBe(false);
    expect(dividir(lite('MESERO'), 'GERENTE_EN_MESA', d)).toBe(false);
  });

  it('para dividir hay que poder cobrar: un capitán con SOLO_CAJA no divide aunque la división lo permita', () => {
    for (const d of POLITICAS_DIVISION) expect(dividir(lite('CAPITAN'), 'SOLO_CAJA', d)).toBe(false);
  });

  it('ADMIN con sesión ERP siempre puede dividir, con cualquier combinación', () => {
    for (const c of POLITICAS_COBRO) for (const d of POLITICAS_DIVISION) expect(dividir(erp('ADMIN'), c, d)).toBe(true);
  });
});

describe('politicaCobro y politicaDivisionCuentas — TenantSettingsService + controller', () => {
  let service: TenantSettingsService;
  let controller: TenantSettingsController;
  let repo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock; update: jest.Mock };
  const filas: Record<string, any> = {};
  const TENANT_A = 'tenant-A';
  const TENANT_B = 'tenant-B';

  beforeEach(async () => {
    for (const k of Object.keys(filas)) delete filas[k];
    repo = {
      findOne: jest.fn(({ where }: any) => Promise.resolve(filas[where.tenantId] ? { ...filas[where.tenantId] } : null)),
      create: jest.fn((d) => d),
      save: jest.fn((d) => { filas[d.tenantId] = { id: `s-${d.tenantId}`, ...d }; return Promise.resolve(filas[d.tenantId]); }),
      update: jest.fn((id: string, patch: any) => {
        const key = Object.keys(filas).find((k) => filas[k].id === id)!;
        filas[key] = { ...filas[key], ...patch };
        return Promise.resolve(undefined);
      }),
    };
    const m: TestingModule = await Test.createTestingModule({
      controllers: [TenantSettingsController],
      providers: [TenantSettingsService, { provide: getRepositoryToken(TenantSetting), useValue: repo }],
    }).compile();
    service = m.get(TenantSettingsService);
    controller = m.get(TenantSettingsController);
  });
  const admin = (t: string) => ({ user: { tenantId: t, roleCode: 'ADMIN' } });

  it('defaults sin backfill: SOLO_CAJA y GERENTE_CAPITAN_CAJERO (sin fila, con fila sin clave y con valor raro)', async () => {
    await expect(service.getPoliticaCobro(TENANT_A)).resolves.toBe('SOLO_CAJA');
    await expect(service.getPoliticaDivisionCuentas(TENANT_A)).resolves.toBe('GERENTE_CAPITAN_CAJERO');
    filas[TENANT_A] = { id: 's-A', tenantId: TENANT_A, posCapabilities: { mesas_cuenta_abierta: true } };
    await expect(service.getPoliticaCobro(TENANT_A)).resolves.toBe('SOLO_CAJA');
    filas[TENANT_A].posCapabilities.politicaCobro = 'LO_QUE_SEA';
    filas[TENANT_A].posCapabilities.politicaDivisionCuentas = 'TODOS_Y_TODAS';
    await expect(service.getPoliticaCobro(TENANT_A)).resolves.toBe('SOLO_CAJA');
    await expect(service.getPoliticaDivisionCuentas(TENANT_A)).resolves.toBe('GERENTE_CAPITAN_CAJERO');
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('se cambian sin migración (JSON posCapabilities) y no pisan capacidades ni la política de devoluciones', async () => {
    filas[TENANT_A] = { id: 's-A', tenantId: TENANT_A, posCapabilities: { mesas_cuenta_abierta: true, politicaDevoluciones: 'CAJERO_LIBRE' } };
    await service.upsert(TENANT_A, { politicaCobro: 'MESERO_EN_MESA', politicaDivisionCuentas: 'TODOS' });
    expect(filas[TENANT_A].posCapabilities).toEqual({ mesas_cuenta_abierta: true, politicaDevoluciones: 'CAJERO_LIBRE', politicaCobro: 'MESERO_EN_MESA', politicaDivisionCuentas: 'TODOS' });
    expect(repo.update.mock.calls[0][1]).not.toHaveProperty('politicaCobro');
    await service.upsert(TENANT_A, { posCapabilities: { notas_cocina_barra: true } });
    await expect(service.getPoliticaCobro(TENANT_A)).resolves.toBe('MESERO_EN_MESA');
    await expect(service.getPoliticaDivisionCuentas(TENANT_A)).resolves.toBe('TODOS');
    await expect(service.getPoliticaDevoluciones(TENANT_A)).resolves.toBe('CAJERO_LIBRE');
  });

  it('valor inválido: 400 y no escribe (campo propio o dentro de posCapabilities)', async () => {
    await expect(service.upsert(TENANT_A, { politicaCobro: 'TODOS' })).rejects.toThrow(BadRequestException);
    await expect(service.upsert(TENANT_A, { politicaDivisionCuentas: 'SOLO_CAJA' })).rejects.toThrow(BadRequestException);
    await expect(service.upsert(TENANT_A, { posCapabilities: { politicaCobro: 'x' } as any })).rejects.toThrow('politicaCobro inválida');
    await expect(service.upsert(TENANT_A, { politicaDivisionCuentas: '' })).rejects.toThrow(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('aislamiento: cambiar la política de A no toca la de B', async () => {
    await service.upsert(TENANT_A, { politicaCobro: 'MESERO_EN_MESA', politicaDivisionCuentas: 'SOLO_GERENTE' });
    await expect(service.getPoliticaCobro(TENANT_B)).resolves.toBe('SOLO_CAJA');
    await expect(service.getPoliticaDivisionCuentas(TENANT_B)).resolves.toBe('GERENTE_CAPITAN_CAJERO');
  });

  it('endpoints: solo ADMIN (o SOPORTE) lee y cambia, y solo de su tenant', async () => {
    for (const h of ['getPoliticaCobro', 'setPoliticaCobro', 'getPoliticaDivisionCuentas', 'setPoliticaDivisionCuentas'] as const) {
      const roles = Reflect.getMetadata(ROLES_KEY, TenantSettingsController.prototype[h]);
      expect(roles).toEqual(['ADMIN', 'SOPORTE']);
    }
    await expect(controller.getPoliticaCobro(TENANT_A, admin(TENANT_A))).resolves.toEqual({ politicaCobro: 'SOLO_CAJA' });
    await expect(controller.setPoliticaCobro(TENANT_A, { politicaCobro: 'GERENTE_EN_MESA' }, admin(TENANT_A))).resolves.toEqual({ politicaCobro: 'GERENTE_EN_MESA' });
    await expect(controller.setPoliticaDivisionCuentas(TENANT_A, { politicaDivisionCuentas: 'TODOS' }, admin(TENANT_A))).resolves.toEqual({ politicaDivisionCuentas: 'TODOS' });
    await expect(controller.getPoliticaDivisionCuentas(TENANT_A, admin(TENANT_B))).rejects.toThrow(ForbiddenException);
    await expect(controller.setPoliticaCobro(TENANT_A, { politicaCobro: 'SOLO_CAJA' }, admin(TENANT_B))).rejects.toThrow(ForbiddenException);
    await expect(controller.setPoliticaCobro(TENANT_A, {}, admin(TENANT_A))).rejects.toThrow(BadRequestException);
    await expect(controller.setPoliticaDivisionCuentas(TENANT_A, { politicaDivisionCuentas: 'NADIE' }, admin(TENANT_A))).rejects.toThrow(BadRequestException);
  });

  it('el GET público de settings no expone ninguna política', async () => {
    filas[TENANT_A] = { id: 's-A', tenantId: TENANT_A, name: 'X', posCapabilities: { mesas_cuenta_abierta: true, politicaCobro: 'SOLO_CAJA', politicaDivisionCuentas: 'TODOS', politicaDevoluciones: 'CAJERO_LIBRE' } };
    const pub: any = await controller.findByTenant(TENANT_A);
    expect(pub.posCapabilities).toEqual({ mesas_cuenta_abierta: true });
  });
});

describe('GET /pos/sales/politicas-mesas — informativo para el POS', () => {
  let sales: SalesService;
  let cobro: PoliticaCobro;
  let division: PoliticaDivision;

  beforeEach(async () => {
    cobro = 'SOLO_CAJA';
    division = 'GERENTE_CAPITAN_CAJERO';
    const m: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: getRepositoryToken(Sale), useValue: {} },
        { provide: getRepositoryToken(Product), useValue: {} },
        { provide: getRepositoryToken(Recipe), useValue: {} },
        { provide: getRepositoryToken(Insumo), useValue: {} },
        { provide: getRepositoryToken(TenantSetting), useValue: {} },
        { provide: getDataSourceToken(), useValue: {} },
        { provide: InsumoAlertsService, useValue: {} },
        { provide: AppointmentsService, useValue: {} },
        { provide: CostsService, useValue: {} },
        { provide: TenantSettingsService, useValue: { getPoliticaCobro: jest.fn(async () => cobro), getPoliticaDivisionCuentas: jest.fn(async () => division) } },
      ],
    }).compile();
    sales = m.get(SalesService);
  });

  it('un mesero POS Lite con los defaults: contexto MESA, no cobra, no divide, solo quita sin cocina', async () => {
    await expect(sales.getPoliticasMesasParaUsuario('t', lite('MESERO'))).resolves.toEqual({
      politicaCobro: 'SOLO_CAJA', politicaDivisionCuentas: 'GERENTE_CAPITAN_CAJERO', rol: 'MESERO', contexto: 'MESA', puedeCobrar: false, puedeDividir: false, soloQuitaSinCocina: true,
    });
  });

  it('un cajero con sesión ERP: CAJA, cobra y divide', async () => {
    await expect(sales.getPoliticasMesasParaUsuario('t', erp('CAJERO'))).resolves.toEqual(expect.objectContaining({ contexto: 'CAJA', puedeCobrar: true, puedeDividir: true, soloQuitaSinCocina: false }));
  });

  it('MESERO_EN_MESA + TODOS: el mesero cobra y divide', async () => {
    cobro = 'MESERO_EN_MESA';
    division = 'TODOS';
    await expect(sales.getPoliticasMesasParaUsuario('t', lite('MESERO'))).resolves.toEqual(expect.objectContaining({ puedeCobrar: true, puedeDividir: true }));
  });

  it('sin tenant: 403', async () => {
    await expect(sales.getPoliticasMesasParaUsuario(undefined, erp('ADMIN'))).rejects.toThrow(ForbiddenException);
  });
});

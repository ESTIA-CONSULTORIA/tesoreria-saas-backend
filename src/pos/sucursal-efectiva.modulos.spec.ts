import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FindOperator } from 'typeorm';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { ShiftsController } from './shifts.controller';
import { SalesController } from './sales.controller';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';
import { BanksService } from '../banks/banks.service';

// Sucursal efectiva en cada módulo: por rol y con aislamiento de tenant.
const TA = 'tenant-A';
const TB = 'tenant-B';
// sucursales por tenant (lo que contestaría branch → company → tenant)
const SUCURSALES: Record<string, string[]> = { [TA]: ['suc-A1', 'suc-A2'], [TB]: ['suc-B1'] };
const query = jest.fn(async (_sql: string, [branchId, tenantId]: any[]) => ((SUCURSALES[tenantId] || []).includes(branchId) ? [{ ok: 1 }] : []));

const CAJERO_A1 = { tenantId: TA, branchId: 'suc-A1', roleCode: 'CAJERO' };
const GERENTE_A2 = { tenantId: TA, branchId: 'suc-A2', roleCode: 'GERENTE' };
const ADMIN_A = { tenantId: TA, branchId: null, roleCode: 'ADMIN' };
const ADMIN_B = { tenantId: TB, branchId: null, roleCode: 'ADMIN' };

describe('productos', () => {
  // repositorio en memoria que entiende where como objeto o arreglo (OR) y IsNull()
  const PRODUCTOS = [
    { id: 'p-a1', tenantId: TA, branchId: 'suc-A1', name: 'De A1', type: 'SERVICE' },
    { id: 'p-a2', tenantId: TA, branchId: 'suc-A2', name: 'De A2', type: 'SERVICE' },
    { id: 'p-shared', tenantId: TA, branchId: null, name: 'Compartido', type: 'SERVICE' },
    { id: 'p-b1', tenantId: TB, branchId: 'suc-B1', name: 'De B1', type: 'SERVICE' },
    { id: 'p-b-shared', tenantId: TB, branchId: null, name: 'Compartido B', type: 'SERVICE' },
  ];
  const coincide = (p: any, w: any) =>
    Object.entries(w).every(([k, v]: any) => (v instanceof FindOperator ? (v as any).type === 'isNull' && p[k] == null : p[k] === v));
  const productsRepo: any = {
    find: jest.fn(async ({ where }: any) => PRODUCTOS.filter((p) => (Array.isArray(where) ? where.some((w) => coincide(p, w)) : coincide(p, where)))),
    manager: { query },
    create: jest.fn((x: any) => x),
    save: jest.fn(async (x: any) => ({ id: 'nuevo', ...x })),
  };
  const service = new ProductsService(productsRepo, {} as any, {} as any);
  const controller = new ProductsController(service);
  const nombres = (r: any[]) => r.map((p) => p.name).sort();

  beforeEach(() => jest.clearAllMocks());

  it('opción A: con sucursal activa se ven los de esa sucursal Y los sin sucursal (compartidos), nunca los de otra ni los de otro tenant', async () => {
    expect(nombres(await controller.findAll({ user: ADMIN_A }, 'suc-A1'))).toEqual(['Compartido', 'De A1']);
    expect(nombres(await controller.findAll({ user: ADMIN_A }, 'suc-A2'))).toEqual(['Compartido', 'De A2']);
  });

  it('un usuario con sucursal ve solo la suya + compartidos, aunque mande el header de otra', async () => {
    expect(nombres(await controller.findAll({ user: CAJERO_A1 }, 'suc-A2'))).toEqual(['Compartido', 'De A1']);
    expect(nombres(await controller.findAll({ user: GERENTE_A2 }, undefined))).toEqual(['Compartido', 'De A2']);
  });

  it('ADMIN sin sucursal y sin header: todo el tenant', async () => {
    expect(nombres(await controller.findAll({ user: ADMIN_A }, undefined))).toEqual(['Compartido', 'De A1', 'De A2']);
  });

  it('aislamiento: el header con una sucursal de OTRO tenant no trae nada ajeno (solo los compartidos propios)', async () => {
    expect(nombres(await controller.findAll({ user: ADMIN_A }, 'suc-B1'))).toEqual(['Compartido']);
    expect(nombres(await controller.findAll({ user: ADMIN_B }, undefined))).toEqual(['Compartido B', 'De B1']);
  });

  it('create: ADMIN sin sucursal sin header → producto compartido (branchId null) y visible de inmediato', async () => {
    await controller.create({ name: 'Nuevo', price: 10 }, { user: ADMIN_A }, undefined);
    expect(productsRepo.save).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TA, branchId: null }));
  });

  it('create: ADMIN con sucursal activa (header) la usa, validada contra su tenant', async () => {
    await controller.create({ name: 'Nuevo' }, { user: ADMIN_A }, 'suc-A2');
    expect(productsRepo.save).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TA, branchId: 'suc-A2' }));
  });

  it('create: usuario con sucursal → la del token; el cuerpo con otra sucursal es 403', async () => {
    await controller.create({ name: 'Nuevo' }, { user: CAJERO_A1 }, 'suc-A2');
    expect(productsRepo.save).toHaveBeenCalledWith(expect.objectContaining({ branchId: 'suc-A1' }));
    expect(() => controller.create({ name: 'X', branchId: 'suc-A2' }, { user: CAJERO_A1 }, undefined)).toThrow(ForbiddenException);
    expect(productsRepo.save).toHaveBeenCalledTimes(1);
  });

  it('create: una sucursal de OTRO tenant (cuerpo o header) es 400 y no se guarda nada', async () => {
    await expect(controller.create({ name: 'X', branchId: 'suc-B1' }, { user: ADMIN_A }, undefined)).rejects.toThrow(BadRequestException);
    await expect(controller.create({ name: 'X' }, { user: ADMIN_A }, 'suc-B1')).rejects.toThrow(BadRequestException);
    expect(productsRepo.save).not.toHaveBeenCalled();
  });

  it('update: mover un producto a una sucursal de otro tenant es 400; un usuario con sucursal no lo mueve a otra (403)', async () => {
    productsRepo.findOne = jest.fn(async () => PRODUCTOS[0]);
    productsRepo.update = jest.fn();
    await expect(controller.update('p-a1', { branchId: 'suc-B1' }, { user: ADMIN_A })).rejects.toThrow(BadRequestException);
    expect(() => controller.update('p-a1', { branchId: 'suc-A2' }, { user: CAJERO_A1 })).toThrow(ForbiddenException);
    expect(productsRepo.update).not.toHaveBeenCalled();
  });
});

describe('categorías: aislamiento por tenant (opción B: las NULL solo se listan a quien las usa)', () => {
  // companies/branches por tenant y productos que usan cada categoría
  const COMPANIES = [{ id: 'co-A', tenantId: TA }, { id: 'co-B', tenantId: TB }];
  const BRANCHES = [
    { id: 'suc-A1', companyId: 'co-A' }, { id: 'suc-A2', companyId: 'co-A' }, { id: 'suc-B1', companyId: 'co-B' },
  ];
  const CATEGORIAS = [
    { id: 'c-A1', name: 'De A1', branchId: 'suc-A1' },
    { id: 'c-A2', name: 'De A2', branchId: 'suc-A2' },
    { id: 'c-B1', name: 'De B1', branchId: 'suc-B1' },
    { id: 'c-null-A', name: 'Compartida usada por A', branchId: null },
    { id: 'c-null-B', name: 'Compartida usada por B', branchId: null },
    { id: 'c-null-ambos', name: 'Compartida usada por ambos', branchId: null },
    { id: 'c-null-nadie', name: 'Compartida sin uso', branchId: null },
  ];
  const USO: Record<string, string[]> = { [TA]: ['c-null-A', 'c-null-ambos', 'c-A1'], [TB]: ['c-null-B', 'c-null-ambos'] };

  function build() {
    // consulta falsa que aplica los dos únicos filtros que el servicio le pone (sucursales del tenant o NULL)
    const filtros: Array<{ sql: string; params: any }> = [];
    const qb: any = {
      andWhere: jest.fn((sql: string, params: any) => { filtros.push({ sql, params }); return qb; }),
      loadRelationCountAndMap: jest.fn(() => qb), orderBy: jest.fn(() => qb), addOrderBy: jest.fn(() => qb),
      getMany: jest.fn(async () => CATEGORIAS.filter((c) => filtros.every((f) => {
        if (f.params?.branchIdsTenant) return c.branchId === null || f.params.branchIdsTenant.includes(c.branchId);
        if (/IS NULL/.test(f.sql)) return c.branchId === null;
        if (f.params?.branchId) return c.branchId === f.params.branchId;
        return true;
      })).map((c) => ({ ...c }))),
    };
    const repo: any = { createQueryBuilder: jest.fn(() => qb), manager: { query: jest.fn(async (_s: string, [t]: any[]) => (USO[t] || []).map((categoryId) => ({ categoryId }))) } };
    const companies: any = { find: jest.fn(async ({ where }: any) => COMPANIES.filter((c) => c.tenantId === where.tenantId)) };
    const branches: any = { find: jest.fn(async ({ where }: any) => BRANCHES.filter((b) => (where.companyId.value as string[]).includes(b.companyId))) };
    return { service: new CategoriesService(repo, branches, companies), repo, qb };
  }
  const nombres = (r: any[]) => r.map((c) => c.name).sort();
  const listar = (user: any, header?: string) => {
    const { service } = build();
    return new CategoriesController(service).findAll({ user }, header);
  };

  it('tenant A: ve sus categorías de sucursal y las NULL que sus productos usan', async () => {
    expect(nombres(await listar(ADMIN_A))).toEqual(['Compartida usada por A', 'Compartida usada por ambos', 'De A1', 'De A2']);
  });

  it('tenant B: nunca ve la NULL de A, aunque exista (solo las suyas y las que usa)', async () => {
    expect(nombres(await listar(ADMIN_B))).toEqual(['Compartida usada por B', 'Compartida usada por ambos', 'De B1']);
    expect(nombres(await listar(ADMIN_B))).not.toContain('Compartida usada por A');
  });

  it('una NULL que nadie usa no se lista a ningún tenant', async () => {
    expect(nombres(await listar(ADMIN_A))).not.toContain('Compartida sin uso');
    expect(nombres(await listar(ADMIN_B))).not.toContain('Compartida sin uso');
  });

  it('ADMIN sin sucursal: sus compartidas y las de sus sucursales, jamás las de otro tenant (ni con header ajeno)', async () => {
    const r = nombres(await listar(ADMIN_A, 'suc-B1'));
    expect(r).not.toContain('De B1');
    expect(r).not.toContain('Compartida usada por B');
  });

  it('ADMIN sin sucursal con una sucursal activa propia: las de esa sucursal + las compartidas que su tenant usa', async () => {
    expect(nombres(await listar(ADMIN_A, 'suc-A2'))).toEqual(['Compartida usada por A', 'Compartida usada por ambos', 'De A2']);
  });

  it('usuario con sucursal: la suya + las compartidas que su tenant usa; el header de otra sucursal se ignora', async () => {
    expect(nombres(await listar(CAJERO_A1))).toEqual(['Compartida usada por A', 'Compartida usada por ambos', 'De A1']);
    expect(nombres(await listar(CAJERO_A1, 'suc-A2'))).toEqual(['Compartida usada por A', 'Compartida usada por ambos', 'De A1']);
    expect(nombres(await listar(GERENTE_A2))).toEqual(['Compartida usada por A', 'Compartida usada por ambos', 'De A2']);
  });

  it('tenant sin sucursales: solo las NULL que usa', async () => {
    const { service } = build();
    const r = await new CategoriesController(service).findAll({ user: { tenantId: 'tenant-C', roleCode: 'ADMIN' } }, undefined);
    expect(r).toEqual([]);
  });

  it('crear categoría: sucursal efectiva (token) o NULL; una sucursal de otro tenant es 400', async () => {
    const repo: any = { create: jest.fn((x: any) => x), save: jest.fn(async (x: any) => x), manager: { query } };
    const service = new CategoriesService(repo, {} as any, {} as any);
    const c = new CategoriesController(service);
    await c.create({ name: 'X' }, { user: CAJERO_A1 }, 'suc-A2');
    expect(repo.save).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'X', branchId: 'suc-A1' }));
    await c.create({ name: 'Y' }, { user: ADMIN_A }, undefined);
    expect(repo.save).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Y', branchId: null }));
    await c.create({ name: 'Z' }, { user: ADMIN_A }, 'suc-A2');
    expect(repo.save).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Z', branchId: 'suc-A2' }));
    await expect(c.create({ name: 'W', branchId: 'suc-B1' }, { user: ADMIN_A }, undefined)).rejects.toThrow(BadRequestException);
    expect(() => c.create({ name: 'V', branchId: 'suc-A2' }, { user: CAJERO_A1 }, undefined)).toThrow(ForbiddenException);
    expect(repo.save).toHaveBeenCalledTimes(3);
  });
});

describe('turnos', () => {
  const shifts: any = { openShift: jest.fn(async (d: any) => d), findOpenShift: jest.fn(), findAll: jest.fn() };
  const c = new ShiftsController(shifts);
  beforeEach(() => jest.clearAllMocks());

  it('abrir turno: la sucursal es la del usuario; otra es 403', () => {
    c.openShift({ sucursalId: 'suc-A1', cajero: 'c', fondoInicial: 0 }, { user: CAJERO_A1 });
    expect(shifts.openShift).toHaveBeenCalledWith(expect.objectContaining({ sucursalId: 'suc-A1', tenantId: TA }));
    expect(() => c.openShift({ sucursalId: 'suc-A2' }, { user: CAJERO_A1 })).toThrow(ForbiddenException);
  });

  it('ADMIN sin sucursal abre en la que manda (el servicio la valida contra su tenant)', () => {
    c.openShift({ sucursalId: 'suc-A2' }, { user: ADMIN_A });
    expect(shifts.openShift).toHaveBeenCalledWith(expect.objectContaining({ sucursalId: 'suc-A2' }));
  });

  it('turno abierto y listado: usuario con sucursal siempre la suya; el header no es permiso', () => {
    c.getOpenShift('caj', 'suc-A2', { user: CAJERO_A1 }, 'suc-A2');
    expect(shifts.findOpenShift).toHaveBeenCalledWith('caj', 'suc-A1', TA);
    c.getShifts({}, { user: CAJERO_A1 }, 'suc-A2');
    expect(shifts.findAll).toHaveBeenCalledWith(expect.objectContaining({ sucursalId: 'suc-A1', tenantId: TA }));
    c.getShifts({}, { user: ADMIN_A }, undefined);
    expect(shifts.findAll).toHaveBeenLastCalledWith(expect.objectContaining({ sucursalId: undefined, tenantId: TA }));
  });
});

describe('ventas', () => {
  const sales: any = { create: jest.fn(async (d: any) => d), findAll: jest.fn(), buscarCuentasAbiertas: jest.fn() };
  const c = new SalesController(sales, {} as any);
  beforeEach(() => jest.clearAllMocks());

  it('crear venta: la sucursal es la del usuario; mandar otra es 403 y no se crea nada', () => {
    c.createSale({ sucursalId: 'suc-A1', items: [] }, { user: CAJERO_A1 });
    expect(sales.create).toHaveBeenCalledWith(expect.objectContaining({ sucursalId: 'suc-A1', tenantId: TA }), CAJERO_A1);
    expect(() => c.createSale({ sucursalId: 'suc-A2', items: [] }, { user: CAJERO_A1 })).toThrow(ForbiddenException);
    expect(sales.create).toHaveBeenCalledTimes(1);
  });

  it('historial y cuentas abiertas: un usuario con sucursal no ve otras aunque pida otro sucursalId; ADMIN filtra o ve todas', () => {
    c.getSales({ sucursalId: 'suc-A2' }, { user: CAJERO_A1 });
    expect(sales.findAll).toHaveBeenCalledWith(expect.objectContaining({ sucursalId: 'suc-A1', tenantId: TA }));
    c.getSales({ sucursalId: 'suc-A2' }, { user: ADMIN_A });
    expect(sales.findAll).toHaveBeenLastCalledWith(expect.objectContaining({ sucursalId: 'suc-A2', tenantId: TA }));
    c.getSales({}, { user: ADMIN_A });
    expect(sales.findAll.mock.calls[2][0].sucursalId).toBeUndefined();
    c.getCuentasAbiertas({ sucursalId: 'suc-A2' }, { user: GERENTE_A2 });
    expect(sales.buscarCuentasAbiertas).toHaveBeenCalledWith(TA, expect.objectContaining({ sucursalId: 'suc-A2' }));
    c.getCuentasAbiertas({ sucursalId: 'suc-A2' }, { user: CAJERO_A1 });
    expect(sales.buscarCuentasAbiertas).toHaveBeenLastCalledWith(TA, expect.objectContaining({ sucursalId: 'suc-A1' }));
  });
});

describe('configuración del POS y bancos: la sucursal debe ser del tenant', () => {
  it('GET /pos/config/:branchId: sucursal de otro tenant → 403, sin leer la configuración', async () => {
    const repo: any = { findOne: jest.fn(), manager: { query } };
    const posService = new PosService(repo, {} as any, {} as any, {} as any, {} as any);
    const c = new PosController(posService);
    await expect(c.getConfig('suc-B1', { user: ADMIN_A })).rejects.toThrow(ForbiddenException);
    expect(repo.findOne).not.toHaveBeenCalled();
    await c.getConfig('suc-A1', { user: ADMIN_A });
    expect(repo.findOne).toHaveBeenCalledWith({ where: { branchId: 'suc-A1' } });
  });

  it('config: un usuario con sucursal no toca la de otra, ni siquiera del mismo tenant (403)', async () => {
    const c = new PosController({} as any);
    await expect(c.getConfig('suc-A2', { user: CAJERO_A1 })).rejects.toThrow(ForbiddenException);
  });

  it('config: actualizar por id no puede reasignar la sucursal y una config ajena es 403', async () => {
    const repo: any = { findOne: jest.fn(async ({ where }: any) => (where.id === 'cfg-b' ? { id: 'cfg-b', branchId: 'suc-B1' } : { id: 'cfg-a', branchId: 'suc-A1' })), update: jest.fn(), manager: { query } };
    const posService = new PosService(repo, {} as any, {} as any, {} as any, {} as any);
    await expect(posService.update('cfg-b', { ticketHeader: 'x' } as any, TA)).rejects.toThrow(ForbiddenException);
    expect(repo.update).not.toHaveBeenCalled();
    await posService.update('cfg-a', { branchId: 'suc-A2', ticketHeader: 'ok' } as any, TA);
    expect(repo.update).toHaveBeenCalledWith('cfg-a', expect.not.objectContaining({ branchId: expect.anything() }));
  });

  it('bancos por sucursal: con la de otro tenant → 403; con una propia, los bancos de esa sucursal', async () => {
    const repo: any = { find: jest.fn().mockResolvedValue([{ id: 'bk' }]), manager: { query } };
    const banks = new BanksService(repo, {} as any);
    await expect(banks.findByBranch('suc-B1', TA)).rejects.toThrow(ForbiddenException);
    expect(repo.find).not.toHaveBeenCalled();
    await expect(banks.findByBranch('suc-A1', TA)).resolves.toEqual([{ id: 'bk' }]);
  });
});

// Regresión: el flujo normal de un cajero con sucursal NO recibe el 403 nuevo, con y sin X-Branch-Id y con las formas en que
// el frontend arma `sucursalId` (la suya, la de la sesión NIP o ninguna).
describe('regresión: flujo normal de un cajero con sucursal', () => {
  const RECEPCION_A1 = { tenantId: TA, branchId: 'suc-A1', roleCode: 'RECEPCION' };
  const shifts: any = { openShift: jest.fn(async (d: any) => ({ id: 'turno-1', ...d })), closeShift: jest.fn(async () => ({ ok: true })), findOpenShift: jest.fn(async () => ({ id: 'turno-1' })), findAll: jest.fn(async () => []) };
  const sales: any = { create: jest.fn(async (d: any) => ({ id: 'v-1', ...d })), findAll: jest.fn(async () => []), buscarCuentasAbiertas: jest.fn(async () => []) };
  const turnos = new ShiftsController(shifts);
  const ventas = new SalesController(sales, {} as any);
  beforeEach(() => jest.clearAllMocks());

  // header ausente, igual a la propia, o rancio de otra sucursal (el interceptor del frontend lo manda siempre)
  describe.each([
    ['CAJERO', CAJERO_A1],
    ['RECEPCION', RECEPCION_A1],
  ])('%s', (_rol, user) => {
    describe.each([
      ['sin X-Branch-Id', undefined],
      ['con X-Branch-Id propio', 'suc-A1'],
      ['con X-Branch-Id rancio de otra sucursal', 'suc-A2'],
    ])('%s', (_etiqueta, header) => {
      it('abre turno, vende, ve el historial y cierra el turno sin errores', async () => {
        const req = { user };
        const turno: any = await turnos.openShift({ cajero: 'u-1', sucursalId: 'suc-A1', fondoInicial: 500 }, req);
        expect(turno.sucursalId).toBe('suc-A1');

        expect(() => turnos.getOpenShift('u-1', 'suc-A1', req, header)).not.toThrow();
        expect(shifts.findOpenShift).toHaveBeenLastCalledWith('u-1', 'suc-A1', TA);

        const venta: any = await ventas.createSale({ items: [], total: 100, cajero: 'u-1', turnoId: turno.id, sucursalId: 'suc-A1' }, req);
        expect(venta.sucursalId).toBe('suc-A1');

        // historial: el POS manda solo turnoId; el header no cambia la sucursal
        await ventas.getSales({ turnoId: turno.id }, req);
        expect(sales.findAll).toHaveBeenLastCalledWith(expect.objectContaining({ turnoId: turno.id, sucursalId: 'suc-A1', tenantId: TA }));
        await turnos.getShifts({}, req, header);
        expect(shifts.findAll).toHaveBeenLastCalledWith(expect.objectContaining({ sucursalId: 'suc-A1' }));

        await turnos.closeShift(turno.id, { efectivoContado: 500 }, req);
        expect(shifts.closeShift).toHaveBeenCalledWith('turno-1', expect.anything(), TA);
      });
    });
  });

  it('sesión NIP (POS Lite) cuyo cliente manda la sucursal que le devolvió el login: es la del token, sin 403', async () => {
    const nip = { tenantId: TA, branchId: 'suc-A1', roleCode: 'CAJERO', posLiteAccess: true };
    await expect(turnos.openShift({ cajero: 'u-nip', sucursalId: 'suc-A1', tenantId: TA, fondoInicial: 0 }, { user: nip })).resolves.toBeDefined();
    await expect(ventas.createSale({ items: [], cajero: 'u-nip', sucursalId: 'suc-A1' }, { user: nip })).resolves.toBeDefined();
  });

  it('cliente que no manda sucursal (null/undefined/vacío): el servidor usa la del token, no falla', async () => {
    for (const vacio of [undefined, null, '']) {
      const v: any = await ventas.createSale({ items: [], cajero: 'u-1', sucursalId: vacio }, { user: CAJERO_A1 });
      expect(v.sucursalId).toBe('suc-A1');
      const t: any = await turnos.openShift({ cajero: 'u-1', sucursalId: vacio, fondoInicial: 1 }, { user: CAJERO_A1 });
      expect(t.sucursalId).toBe('suc-A1');
    }
  });

  it('el ERP con un usuario con sucursal que opera por un cajero de NIP: cajero distinto, misma sucursal de la sesión', async () => {
    const v: any = await ventas.createSale({ items: [], cajero: 'u-otro-cajero', sucursalId: 'suc-A2' }, { user: GERENTE_A2 });
    expect(v.sucursalId).toBe('suc-A2');
    expect(v.cajero).toBe('u-otro-cajero');
  });

  it('lo único que sí da 403: mandar de forma explícita la sucursal de otro', () => {
    expect(() => ventas.createSale({ items: [], sucursalId: 'suc-A2' }, { user: CAJERO_A1 })).toThrow(ForbiddenException);
    expect(() => turnos.openShift({ sucursalId: 'suc-A2' }, { user: RECEPCION_A1 })).toThrow(ForbiddenException);
  });
});

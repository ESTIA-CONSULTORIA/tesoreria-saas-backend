import { FacturacionLecturasService, MAX_LOTE, PRODUCTOS_POR_PAGINA } from './facturacion-lecturas.service';
import { FacturacionController } from './facturacion.controller';
import { ROLES_KEY } from '../auth/roles.decorator';

const A = 'tenant-A';
const B = 'tenant-B';

// Operador `In` de TypeORM (FindOperator): _value trae la lista.
const valoresIn = (v: any): string[] => (v && v._value ? v._value : [v]);
const coincide = (f: any, where: any) =>
  Object.entries(where).every(([k, v]: [string, any]) => (v && v._type === 'in' ? valoresIn(v).includes(f[k]) : f[k] === v));

function repo<T extends Record<string, any>>(filas: T[]) {
  return {
    filas,
    find: jest.fn(async ({ where }: any = {}) => filas.filter((f) => coincide(f, where ?? {}))),
    findOne: jest.fn(async ({ where }: any) => filas.find((f) => coincide(f, where)) ?? null),
    create: jest.fn((d: any) => ({ ...d })),
    save: jest.fn(async (d: any) => {
      const lista = Array.isArray(d) ? d : [d];
      lista.forEach((x, i) => {
        const hay = x.id ? filas.find((f) => f.id === x.id) : undefined;
        if (hay) Object.assign(hay, x);
        else filas.push({ ...x, id: x.id ?? `nuevo-${filas.length}-${i}` });
      });
      return d;
    }),
  };
}

// QueryBuilder falso: registra cada condición y devuelve los datos que se le den.
function fakeQb(raw: any[] = [], count = 0) {
  const registro: { where: string[]; params: Record<string, any>; select: string[]; limit?: number; offset?: number } = {
    where: [],
    params: {},
    select: [],
  };
  const qb: any = {
    registro,
    leftJoin: jest.fn(() => qb),
    where: jest.fn((c: string, p?: any) => (registro.where.push(c), Object.assign(registro.params, p), qb)),
    andWhere: jest.fn((c: string, p?: any) => (registro.where.push(c), Object.assign(registro.params, p), qb)),
    select: jest.fn((s: string) => (registro.select.push(s), qb)),
    addSelect: jest.fn((s: string) => (registro.select.push(s), qb)),
    groupBy: jest.fn(() => qb),
    addGroupBy: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    addOrderBy: jest.fn(() => qb),
    offset: jest.fn((n: number) => ((registro.offset = n), qb)),
    limit: jest.fn((n: number) => ((registro.limit = n), qb)),
    clone: jest.fn(() => qb),
    getCount: jest.fn(async () => count),
    getRawMany: jest.fn(async () => raw),
  };
  return qb;
}

function armar(over: { productos?: any[]; fiscales?: any[]; qb?: any; tenants?: any[] } = {}) {
  const emisores = repo<any>([{ id: 'e1', tenantId: A, companyId: 'co-A' }]);
  const sucursales = repo<any>([{ id: 's1', tenantId: A, branchId: 'br-A1', codigoPostalExpedicion: '06600' }]);
  const fiscales = repo<any>(over.fiscales ?? []);
  const companies = repo<any>([
    { id: 'co-A', tenantId: A, tradeName: 'Cafetería Centro', legalName: 'Cafetería SA' },
    { id: 'co-B', tenantId: B, tradeName: 'Empresa Ajena', legalName: 'Ajena SA' },
  ]);
  const branches = repo<any>([
    { id: 'br-A1', companyId: 'co-A', name: 'Matriz', isActive: true },
    { id: 'br-A2', companyId: 'co-A', name: 'Norte', isActive: true },
    { id: 'br-A3', companyId: 'co-A', name: 'Cerrada', isActive: false },
    { id: 'br-B1', companyId: 'co-B', name: 'Sucursal Ajena', isActive: true },
  ]);
  const products = {
    ...repo<any>(over.productos ?? [{ id: 'pr-A1', tenantId: A }, { id: 'pr-A2', tenantId: A }, { id: 'pr-B1', tenantId: B }]),
    createQueryBuilder: jest.fn(() => over.qb ?? fakeQb()),
  };
  const tenants = repo<any>(over.tenants ?? [{ id: A, giro: 'restaurante' }]);
  const service = new FacturacionLecturasService(emisores as any, sucursales as any, fiscales as any, companies as any, branches as any, products as any, tenants as any);
  return { service, fiscales, products };
}

describe('Lecturas fiscales — aislamiento por tenant', () => {
  it('resumen: solo empresas del tenant, por NOMBRE, con conteos de sucursales con/sin CP', async () => {
    const { service } = armar({ qb: fakeQb([], 3) });
    const r = await service.resumen(A);
    expect(r.empresas).toEqual([
      { companyId: 'co-A', empresa: 'Cafetería Centro', emisorCompleto: true, facturacionActiva: false, sucursalesTotal: 2, sucursalesConCp: 1 },
    ]);
    expect(JSON.stringify(r)).not.toContain('Ajena');
    expect(r.productos).toEqual({ total: 3, conClaves: 3, pendientes: 0 });
  });

  it('resumen: los conteos de producto se acotan por tenant y activos', async () => {
    const qb = fakeQb([], 0);
    const { service } = armar({ qb });
    await service.resumen(A);
    expect(qb.registro.where).toEqual(expect.arrayContaining(['p.tenantId = :tenantId', 'p.isActive = true']));
    expect(qb.registro.params.tenantId).toBe(A);
  });

  it('sucursales: nombres, sin las inactivas ni las de otro tenant', async () => {
    const { service } = armar();
    const filas = await service.listarSucursales(A);
    expect(filas.map((f) => [f.empresa, f.sucursal, f.codigoPostalExpedicion, f.completo])).toEqual([
      ['Cafetería Centro', 'Matriz', '06600', true],
      ['Cafetería Centro', 'Norte', null, false],
    ]);
    expect(await service.listarSucursales('tenant-sin-empresas')).toEqual([]);
  });

  it('productos: filtra por tenant, pagina de 15 en 15 y devuelve nombres y estado', async () => {
    const qb = fakeQb(
      [
        { id: 'p1', producto: 'Café americano', categoria: 'Bebidas', tasaIva: '16', esServicio: false, claveProdServ: '90101501', claveUnidad: 'H87', unidadNombre: 'Pieza', objetoImp: '02' },
        { id: 'p2', producto: 'Baguette', categoria: null, tasaIva: null, esServicio: false, claveProdServ: null, claveUnidad: null, unidadNombre: null, objetoImp: null },
      ],
      31,
    );
    const { service } = armar({ qb });
    const r = await service.listarProductos(A, { page: '3', estado: 'pendientes', q: 'caf_é%' });
    expect(qb.registro.params.tenantId).toBe(A);
    expect(qb.registro.where).toContain('f.id IS NULL');
    expect(qb.registro.params.q).toBe('%caf\\_é\\%%'); // _ y % del usuario no son comodines
    expect(qb.registro.limit).toBe(PRODUCTOS_POR_PAGINA);
    expect(qb.registro.offset).toBe(2 * PRODUCTOS_POR_PAGINA);
    expect(r).toMatchObject({ page: 3, total: 31, paginas: 3 });
    expect(r.items[0]).toMatchObject({ producto: 'Café americano', categoria: 'Bebidas', completo: true });
    expect(r.items[1]).toMatchObject({ producto: 'Baguette', categoria: 'Sin categoría', claveProdServ: null, completo: false });
  });

  it('productos: página inválida cae a 1 y SIN_CATEGORIA filtra por nulos', async () => {
    const qb = fakeQb([], 0);
    const { service } = armar({ qb });
    const r = await service.listarProductos(A, { page: '-4', categoria: 'SIN_CATEGORIA', estado: 'completos' });
    expect(r.page).toBe(1);
    expect(qb.registro.offset).toBe(0);
    expect(qb.registro.where).toEqual(expect.arrayContaining(['p.categoryId IS NULL', 'f.id IS NOT NULL']));
  });

  describe('lote', () => {
    const ok = { productIds: ['pr-A1', 'pr-A2'], claveProdServ: '90101501', claveUnidad: 'h87', objetoImp: '02' };

    it('aplica a los productos del tenant (crea o actualiza) y normaliza', async () => {
      const { service, fiscales } = armar({ fiscales: [{ id: 'f1', tenantId: A, productId: 'pr-A1', claveProdServ: '11111111', claveUnidad: 'E48', objetoImp: '01', unidadNombre: null }] });
      expect(await service.guardarLote(A, ok)).toEqual({ cambiados: 2 });
      expect(fiscales.filas).toHaveLength(2); // uno actualizado, uno creado
      expect(fiscales.filas.find((f) => f.productId === 'pr-A1')).toMatchObject({ id: 'f1', claveProdServ: '90101501', claveUnidad: 'H87' });
    });

    it('todo o nada: un solo producto de otro tenant frena el lote completo', async () => {
      const { service, fiscales } = armar();
      await expect(service.guardarLote(A, { ...ok, productIds: ['pr-A1', 'pr-B1'] })).rejects.toThrow('Algún producto no se encontró');
      await expect(service.guardarLote(A, { ...ok, productIds: ['pr-B1'] })).rejects.toThrow('Algún producto no se encontró');
      expect(fiscales.filas).toHaveLength(0);
      expect(fiscales.save).not.toHaveBeenCalled();
    });

    it('valida la clave de 8 dígitos, la unidad, el objeto, el vacío y el tope', async () => {
      const { service } = armar();
      await expect(service.guardarLote(A, { ...ok, claveProdServ: '' })).rejects.toThrow('8 dígitos');
      await expect(service.guardarLote(A, { ...ok, claveProdServ: '1234' })).rejects.toThrow('8 dígitos');
      await expect(service.guardarLote(A, { ...ok, claveUnidad: '!!' })).rejects.toThrow('unidad');
      await expect(service.guardarLote(A, { ...ok, objetoImp: '09' })).rejects.toThrow('Objeto de impuesto');
      await expect(service.guardarLote(A, { ...ok, productIds: [] })).rejects.toThrow('al menos un producto');
      const muchos = Array.from({ length: MAX_LOTE + 1 }, (_, i) => `p${i}`);
      await expect(service.guardarLote(A, { ...ok, productIds: muchos })).rejects.toThrow(`Máximo ${MAX_LOTE}`);
    });

    it('ids repetidos cuentan una vez', async () => {
      const { service } = armar();
      expect(await service.guardarLote(A, { ...ok, productIds: ['pr-A1', 'pr-A1'] })).toEqual({ cambiados: 1 });
    });
  });

  describe('sugerencias', () => {
    it('propone unidad y objeto por categoría y NUNCA una clave SAT', async () => {
      const qb = fakeQb([
        { categoriaId: 'c1', categoria: 'Bebidas', productos: '4', servicios: '0' },
        { categoriaId: null, categoria: null, productos: '2', servicios: '2' },
      ]);
      const { service } = armar({ qb });
      const r = await service.sugerencias(A);
      expect(r.giro).toBe('restaurante');
      expect(r.clavesConfirmadas).toBe(false);
      expect(r.categorias.every((c) => c.claveProdServ === null)).toBe(true);
      expect(r.categorias[0]).toMatchObject({ categoria: 'Bebidas', claveUnidad: 'H87', objetoImp: '02', productosPendientes: 4 });
      expect(r.categorias[1]).toMatchObject({ categoria: 'Sin categoría', claveUnidad: 'E48', unidadNombre: 'Servicio' });
      expect(qb.registro.params.tenantId).toBe(A);
      expect(qb.registro.where).toContain('f.id IS NULL');
    });

    it('gimnasio sugiere servicio; un giro desconocido cae a genérico', async () => {
      const qb = fakeQb([{ categoriaId: 'c1', categoria: 'Planes', productos: '1', servicios: '0' }]);
      const gym = armar({ qb, tenants: [{ id: A, giro: 'gimnasio' }] });
      expect((await gym.service.sugerencias(A)).categorias[0].claveUnidad).toBe('E48');
      const raro = armar({ qb: fakeQb([]), tenants: [{ id: A, giro: 'inventado' }] });
      expect((await raro.service.sugerencias(A)).giro).toBe('generico');
    });
  });
});

describe('FacturacionController — lecturas nuevas', () => {
  const lecturas = {
    resumen: jest.fn().mockResolvedValue({}),
    listarSucursales: jest.fn().mockResolvedValue([]),
    listarProductos: jest.fn().mockResolvedValue({}),
    guardarLote: jest.fn().mockResolvedValue({}),
    sugerencias: jest.fn().mockResolvedValue({}),
  };
  const controller = new FacturacionController({} as any, lecturas as any);
  const req = { user: { tenantId: A, roleCode: 'ADMIN' } };

  it('todas usan el tenant del token', async () => {
    await controller.resumen(req);
    await controller.sucursales(req);
    await controller.productos(req, { q: 'x' });
    await controller.productosLote({ productIds: ['a'] } as any, req);
    await controller.sugerencias(req);
    for (const fn of Object.values(lecturas)) expect(fn.mock.calls[0][0]).toBe(A);
  });

  it('sin tenant en la sesión: 403 en cada una', () => {
    const sin = { user: { roleCode: 'SOPORTE' } };
    expect(() => controller.resumen(sin)).toThrow('tenant');
    expect(() => controller.sucursales(sin)).toThrow('tenant');
    expect(() => controller.productos(sin, {})).toThrow('tenant');
    expect(() => controller.productosLote({} as any, sin)).toThrow('tenant');
    expect(() => controller.sugerencias(sin)).toThrow('tenant');
  });

  it('el rol sigue siendo ADMIN y GERENTE', () => {
    expect(Reflect.getMetadata(ROLES_KEY, FacturacionController)).toEqual(['ADMIN', 'GERENTE']);
  });
});

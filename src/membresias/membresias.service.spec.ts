import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { MembresiasService } from './membresias.service';
import { Socio } from './entities/socio.entity';
import { PlanMembresia } from './entities/plan-membresia.entity';
import { Membresia } from './entities/membresia.entity';
import { CheckinSocio } from './entities/checkin-socio.entity';
import { Product } from '../pos/entities/product.entity';
import { PosCategory } from '../pos/entities/category.entity';
import { Sale } from '../pos/entities/sale.entity';
import { TenantSettingsService } from '../tenant-settings/tenant-settings.service';
import { hashNip } from './membresias.util';
import { NipThrottleService, NIP_LIMITS } from '../pos/nip-throttle.service';

// MembresiasService sobre repositorios en memoria. Reloj fijo: "hoy" = 2026-10-05 (Tijuana).
const A = 'tenant-A';
const B = 'tenant-B';

const coincide = (row: any, where: any): boolean =>
  Object.entries(where || {}).every(([k, v]: [string, any]) => {
    if (v && typeof v === 'object' && v._type === 'in') return v._value.includes(row[k]);
    if (v && typeof v === 'object' && v._type === 'between') return row[k] >= v._value[0] && row[k] <= v._value[1];
    return row[k] === v;
  });

function repoEnMemoria<T extends Record<string, any>>(filas: T[], defaults: Record<string, any> = {}) {
  let n = 0;
  return {
    filas,
    create: jest.fn((d: any) => ({ ...d })),
    save: jest.fn((d: any) => {
      const fila = { id: d.id ?? `id-${++n}-${filas.length}`, createdAt: new Date(), ...defaults, ...d };
      filas.push(fila as T);
      return Promise.resolve({ ...fila });
    }),
    find: jest.fn((o: any = {}) => {
      let r = filas.filter((f) => coincide(f, o.where));
      if (o.order) {
        const [k, dir] = Object.entries(o.order)[0] as [string, string];
        r = [...r].sort((a: any, b: any) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (dir === 'DESC' ? -1 : 1));
      }
      if (o.take) r = r.slice(0, o.take);
      return Promise.resolve(r.map((x) => ({ ...x })));
    }),
    findOne: jest.fn((o: any) => Promise.resolve(filas.find((f) => coincide(f, o.where)) ? { ...filas.find((f) => coincide(f, o.where)) } : null)),
    update: jest.fn((id: string, patch: any) => {
      const f = filas.find((x: any) => x.id === id);
      if (f) Object.assign(f, patch);
      return Promise.resolve(undefined);
    }),
    delete: jest.fn((id: string) => {
      const i = filas.findIndex((x: any) => x.id === id);
      if (i >= 0) filas.splice(i, 1);
      return Promise.resolve(undefined);
    }),
  };
}

describe('MembresiasService', () => {
  let svc: MembresiasService;
  let socios: any[]; let planes: any[]; let membresias: any[]; let checkins: any[]; let productos: any[]; let categorias: any[]; let ventas: any[];
  let cfg: { diasAviso: number; diasGracia: number };

  beforeAll(() => {
    jest.useFakeTimers({
      now: new Date('2026-10-05T14:00:00Z'),
      doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'hrtime', 'performance'],
    });
  });
  afterAll(() => jest.useRealTimers());

  beforeEach(async () => {
    socios = []; planes = []; membresias = []; checkins = []; productos = []; categorias = []; ventas = [];
    cfg = { diasAviso: 7, diasGracia: 0 };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembresiasService,
        { provide: getRepositoryToken(Socio), useValue: repoEnMemoria(socios, { estado: 'ACTIVO' }) },
        { provide: getRepositoryToken(PlanMembresia), useValue: repoEnMemoria(planes, { activo: true }) },
        { provide: getRepositoryToken(Membresia), useValue: repoEnMemoria(membresias, { diasCongelados: 0 }) },
        { provide: getRepositoryToken(CheckinSocio), useValue: repoEnMemoria(checkins) },
        { provide: getRepositoryToken(Product), useValue: repoEnMemoria(productos) },
        { provide: getRepositoryToken(PosCategory), useValue: repoEnMemoria(categorias) },
        { provide: getRepositoryToken(Sale), useValue: repoEnMemoria(ventas) },
        { provide: TenantSettingsService, useValue: { getMembresiasConfig: jest.fn(() => Promise.resolve({ ...cfg })) } },
        NipThrottleService,
      ],
    }).compile();
    svc = module.get(MembresiasService);
  });

  const plan = (extra: Record<string, any> = {}) => ({ nombre: 'Mensual', precio: 500, periodoTipo: 'MESES', periodoCantidad: 1, ...extra });
  const periodo = (socioId: string, ini: string, fin: string, extra: Record<string, any> = {}) => {
    membresias.push({ id: `m-${membresias.length + 1}`, tenantId: A, socioId, planId: planes[0]?.id ?? null, planNombre: 'Mensual', estado: 'ACTIVA', fechaInicio: ini, fechaFin: fin, diasCongelados: 0, ...extra });
  };

  describe('planes', () => {
    it('crear un plan crea su producto del POS (servicio) con el mismo precio y la misma tasa', async () => {
      const p = await svc.crearPlan(A, plan({ tasaIva: 'EXENTO', beneficios: { descuentoPct: 10, notas: ['Acceso a regaderas'] } }));
      expect(p).toMatchObject({ nombre: 'Mensual', precio: 500, periodoTipo: 'MESES', periodoCantidad: 1, tasaIva: 'EXENTO', activo: true });
      expect(productos).toHaveLength(1);
      expect(productos[0]).toMatchObject({ tenantId: A, name: 'Membresía: Mensual', price: 500, esServicio: true, isActive: true, tasaIva: 'EXENTO' });
      expect(p.productId).toBe(productos[0].id);
    });

    it('editar precio, nombre y estado se refleja en el producto; lo ya vendido conserva su precio (snapshot en la membresía)', async () => {
      const p = await svc.crearPlan(A, plan());
      await svc.actualizarPlan(p.id, A, { precio: 650, nombre: 'Mensual plus', activo: false });
      expect(productos[0]).toMatchObject({ name: 'Membresía: Mensual plus', price: 650, isActive: false });
    });

    it('validaciones: precio negativo, periodo inválido, cantidad no entera, tasa de IVA inválida, descuento fuera de rango', async () => {
      const malos: Array<Record<string, any>> = [
        { precio: -1 }, { precio: 'x' }, { periodoTipo: 'SEMANAS' }, { periodoCantidad: 0 }, { periodoCantidad: 1.5 },
        { tasaIva: '21' }, { diasCongelacionMax: -1 }, { beneficios: { descuentoPct: 120 } }, { nombre: '  ' },
      ];
      for (const m of malos) await expect(svc.crearPlan(A, plan(m))).rejects.toThrow(BadRequestException);
      expect(planes).toHaveLength(0);
      expect(productos).toHaveLength(0);
    });

    it('nombre repetido en el mismo negocio: 409; en otro negocio sí se puede', async () => {
      await svc.crearPlan(A, plan());
      await expect(svc.crearPlan(A, plan())).rejects.toThrow(ConflictException);
      await expect(svc.crearPlan(B, plan())).resolves.toBeDefined();
    });

    it('aislamiento: otro negocio no ve ni edita un plan ajeno', async () => {
      const p = await svc.crearPlan(A, plan());
      expect(await svc.listarPlanes(B)).toHaveLength(0);
      await expect(svc.actualizarPlan(p.id, B, { precio: 1 })).rejects.toThrow(NotFoundException);
      expect(productos[0].price).toBe(500);
    });
  });

  describe('socios', () => {
    it('número consecutivo automático, NIP guardado como hash y único por negocio', async () => {
      const a = await svc.crearSocio(A, { nombre: 'Ana', nip: '1234' });
      const b = await svc.crearSocio(A, { nombre: 'Beto' });
      expect([a.numeroSocio, b.numeroSocio]).toEqual(['1', '2']);
      expect(socios[0].nipHash).toBe(hashNip(A, '1234'));
      expect(JSON.stringify(a)).not.toContain(hashNip(A, '1234'));
      await expect(svc.crearSocio(A, { nombre: 'Clara', nip: '1234' })).rejects.toThrow(/NIP ya lo usa/);
      await expect(svc.crearSocio(B, { nombre: 'Clara', nip: '1234' })).resolves.toBeDefined(); // otro negocio: sí
    });

    it('número repetido: 409; NIP inválido y sin nombre: 400', async () => {
      await svc.crearSocio(A, { nombre: 'Ana', numeroSocio: '100' });
      await expect(svc.crearSocio(A, { nombre: 'Otro', numeroSocio: '100' })).rejects.toThrow(ConflictException);
      await expect(svc.crearSocio(A, { nombre: 'X', nip: '12' })).rejects.toThrow(BadRequestException);
      await expect(svc.crearSocio(A, { nombre: ' ' })).rejects.toThrow(BadRequestException);
    });

    it('lista con su situación, busca por texto y por número; otro negocio no ve a los socios', async () => {
      const ana = await svc.crearSocio(A, { nombre: 'Ana', apellidos: 'López' });
      await svc.crearSocio(A, { nombre: 'Beto' });
      periodo(ana.id, '2026-10-01', '2026-10-31');
      const todos: any[] = await svc.listarSocios(A);
      expect(todos.map((s) => [s.nombre, s.situacion.estado])).toEqual([['Ana', 'VIGENTE'], ['Beto', 'SIN_MEMBRESIA']]);
      expect((await svc.listarSocios(A, { q: 'lópez' })).map((s: any) => s.nombre)).toEqual(['Ana']);
      expect((await svc.listarSocios(A, { situacion: 'SIN_MEMBRESIA' })).map((s: any) => s.nombre)).toEqual(['Beto']);
      expect(await svc.listarSocios(B)).toHaveLength(0);
      await expect(svc.obtenerSocio(ana.id, B)).rejects.toThrow(NotFoundException);
      await expect(svc.buscarPorNumero(B, '1')).rejects.toThrow(NotFoundException);
    });

    it('buscarPorNumero devuelve su descuento de beneficio si la membresía está vigente', async () => {
      const p = await svc.crearPlan(A, plan({ beneficios: { descuentoPct: 10 } }));
      const ana = await svc.crearSocio(A, { nombre: 'Ana' });
      membresias.push({ id: 'm', tenantId: A, socioId: ana.id, planId: p.id, estado: 'ACTIVA', fechaInicio: '2026-10-01', fechaFin: '2026-10-31' });
      expect(await svc.buscarPorNumero(A, '1')).toMatchObject({ nombre: 'Ana', descuentoPct: 10, situacion: { estado: 'VIGENTE' } });
    });
  });

  describe('congelar y descongelar', () => {
    let socioId: string;
    beforeEach(async () => {
      const p = await svc.crearPlan(A, plan({ diasCongelacionMax: 10 }));
      planes[0] = { ...planes[0] };
      socioId = (await svc.crearSocio(A, { nombre: 'Ana' })).id;
      membresias.push({ id: 'm1', tenantId: A, socioId, planId: p.id, planNombre: 'Mensual', estado: 'ACTIVA', fechaInicio: '2026-10-01', fechaFin: '2026-10-31', diasCongelados: 0 });
    });

    it('congelar deja de dejarla entrar; descongelar agrega los días en pausa al final', async () => {
      await svc.congelar('m1', A);
      expect(membresias[0]).toMatchObject({ estado: 'CONGELADA', congeladaDesde: '2026-10-05' });
      jest.setSystemTime(new Date('2026-10-09T14:00:00Z')); // 4 días después
      const r = await svc.descongelar('m1', A);
      expect(r).toMatchObject({ diasAcreditados: 4, diasSinAcreditar: 0 });
      expect(membresias[0]).toMatchObject({ estado: 'ACTIVA', fechaFin: '2026-11-04', diasCongelados: 4, congeladaDesde: null });
      jest.setSystemTime(new Date('2026-10-05T14:00:00Z'));
    });

    it('más días de los permitidos: solo se acreditan los del plan y se informa lo que no', async () => {
      await svc.congelar('m1', A);
      jest.setSystemTime(new Date('2026-10-25T14:00:00Z')); // 20 días en pausa, el plan permite 10
      const r = await svc.descongelar('m1', A);
      expect(r).toMatchObject({ diasAcreditados: 10, diasSinAcreditar: 10 });
      expect(membresias[0].fechaFin).toBe('2026-11-10');
      jest.setSystemTime(new Date('2026-10-05T14:00:00Z'));
    });

    it('los periodos programados detrás se recorren los mismos días (no se traslapan)', async () => {
      membresias.push({ id: 'm2', tenantId: A, socioId, planId: planes[0].id, planNombre: 'Mensual', estado: 'ACTIVA', fechaInicio: '2026-11-01', fechaFin: '2026-11-30', diasCongelados: 0 });
      await svc.congelar('m1', A);
      jest.setSystemTime(new Date('2026-10-08T14:00:00Z')); // 3 días
      await svc.descongelar('m1', A);
      expect(membresias[0].fechaFin).toBe('2026-11-03');
      expect(membresias[1]).toMatchObject({ fechaInicio: '2026-11-04', fechaFin: '2026-12-03' });
      jest.setSystemTime(new Date('2026-10-05T14:00:00Z'));
    });

    it('un plan sin congelación, una membresía vencida y una ajena no se pueden congelar', async () => {
      planes[0].diasCongelacionMax = 0;
      await expect(svc.congelar('m1', A)).rejects.toThrow(/no permite congelarla/);
      planes[0].diasCongelacionMax = 10;
      membresias[0].fechaFin = '2026-10-01';
      await expect(svc.congelar('m1', A)).rejects.toThrow(/vigente/);
      membresias[0].fechaFin = '2026-10-31';
      await expect(svc.congelar('m1', B)).rejects.toThrow(NotFoundException);
      expect(membresias[0].estado).toBe('ACTIVA');
    });
  });

  describe('cancelar', () => {
    it('exige motivo y deja constancia; otro negocio no puede', async () => {
      membresias.push({ id: 'm1', tenantId: A, socioId: 's', planNombre: 'x', estado: 'ACTIVA', fechaInicio: '2026-10-01', fechaFin: '2026-10-31' });
      await expect(svc.cancelar('m1', A, ' ', 'g@x')).rejects.toThrow(/motivo/);
      await expect(svc.cancelar('m1', B, 'x', 'g@x')).rejects.toThrow(NotFoundException);
      await svc.cancelar('m1', A, 'cobro duplicado', 'gerente@gym');
      expect(membresias[0]).toMatchObject({ estado: 'CANCELADA' });
      expect(membresias[0].notas).toContain('[CANCELADA por gerente@gym] cobro duplicado');
      await expect(svc.cancelar('m1', A, 'otra vez', 'g')).rejects.toThrow(/ya está cancelada/);
    });
  });

  describe('check-in', () => {
    const actor = { email: 'rec@gym', branchId: 'suc-1' };
    let ana: any;
    beforeEach(async () => {
      ana = await svc.crearSocio(A, { nombre: 'Ana', nip: '4321' });
    });

    it('vigente por número: permitido, con vigencia y días; queda registrado', async () => {
      periodo(ana.id, '2026-10-01', '2026-10-31');
      const r: any = await svc.checkin(A, { numero: '1' }, actor);
      expect(r).toMatchObject({ permitido: true, vigenciaHasta: '2026-10-31', diasRestantes: 26, socio: { nombre: 'Ana' } });
      expect(r.aviso).toBeUndefined();
      expect(checkins[0]).toMatchObject({ tenantId: A, socioId: ana.id, metodo: 'NUMERO', resultado: 'PERMITIDO', registradoPor: 'rec@gym', branchId: 'suc-1' });
    });

    it('por NIP: permitido; un NIP de otro negocio no entra', async () => {
      periodo(ana.id, '2026-10-01', '2026-10-31');
      expect(await svc.checkin(A, { nip: '4321' }, actor)).toMatchObject({ permitido: true });
      expect(checkins[0].metodo).toBe('NIP');
      expect(await svc.checkin(B, { nip: '4321' }, actor)).toEqual({ permitido: false, motivo: 'Socio no encontrado.' });
    });

    it('vence pronto: entra con aviso; vence hoy: entra y avisa', async () => {
      periodo(ana.id, '2026-09-10', '2026-10-09');
      expect(await svc.checkin(A, { numero: '1' }, actor)).toMatchObject({ permitido: true, aviso: 'Su membresía vence en 4 día(s).' });
      membresias[0].fechaFin = '2026-10-05';
      expect(await svc.checkin(A, { numero: '1' }, actor)).toMatchObject({ permitido: true, aviso: 'Su membresía vence hoy.' });
    });

    it('vencida, congelada, programada, sin membresía y de baja: DENEGADO con el motivo, y también queda registrado', async () => {
      const intento = async () => (await svc.checkin(A, { numero: '1' }, actor)) as any;
      expect(await intento()).toMatchObject({ permitido: false, motivo: 'El socio no tiene membresía.' });
      periodo(ana.id, '2026-08-01', '2026-08-31');
      expect(await intento()).toMatchObject({ permitido: false, motivo: 'Su membresía venció el 2026-08-31 (hace 35 día(s)).' });
      membresias.length = 0;
      periodo(ana.id, '2026-10-01', '2026-10-31', { estado: 'CONGELADA' });
      expect(await intento()).toMatchObject({ permitido: false, motivo: 'Su membresía está congelada.' });
      membresias.length = 0;
      periodo(ana.id, '2026-10-20', '2026-11-19');
      expect(await intento()).toMatchObject({ permitido: false, motivo: 'Su membresía empieza el 2026-10-20.' });
      membresias.length = 0;
      periodo(ana.id, '2026-10-01', '2026-10-31');
      socios[0].estado = 'BAJA';
      expect(await intento()).toMatchObject({ permitido: false, motivo: 'El socio está dado de baja.' });
      expect(checkins.every((c) => c.resultado === 'DENEGADO')).toBe(true);
      expect(checkins).toHaveLength(5);
    });

    it('número + NIP: el NIP debe ser de ESE socio; de otro socio o equivocado da el mismo mensaje', async () => {
      periodo(ana.id, '2026-10-01', '2026-10-31');
      await svc.crearSocio(A, { nombre: 'Beto', nip: '9876' });
      expect(await svc.checkin(A, { numero: '1', nip: '4321' }, actor)).toMatchObject({ permitido: true });
      expect(await svc.checkin(A, { numero: '1', nip: '9876' }, actor)).toEqual({ permitido: false, motivo: 'Socio o NIP incorrectos.' });
      expect(await svc.checkin(A, { numero: '1', nip: '0000' }, actor)).toEqual({ permitido: false, motivo: 'Socio o NIP incorrectos.' });
      // un intento con NIP equivocado no deja fila de check-in (no hay un socio verificado a quien atribuirlo)
      expect(checkins).toHaveLength(1);
    });

    it('sin número ni NIP, o NIP mal formado: 400', async () => {
      await expect(svc.checkin(A, {}, actor)).rejects.toThrow(BadRequestException);
      await expect(svc.checkin(A, { nip: '12' }, actor)).rejects.toThrow(BadRequestException);
    });
  });

  describe('alertas y reportes', () => {
    beforeEach(async () => {
      const nombres = ['Vigente', 'PorVencer', 'VenceHoy', 'VencioAyer', 'VencioHaceMes', 'Congelada', 'SinMembresia'];
      for (const n of nombres) await svc.crearSocio(A, { nombre: n });
      const id = (n: string) => socios.find((s) => s.nombre === n).id;
      periodo(id('Vigente'), '2026-10-01', '2026-11-30');
      periodo(id('PorVencer'), '2026-09-12', '2026-10-10');
      periodo(id('VenceHoy'), '2026-09-06', '2026-10-05');
      periodo(id('VencioAyer'), '2026-09-04', '2026-10-04');
      periodo(id('VencioHaceMes'), '2026-08-05', '2026-09-04');
      periodo(id('Congelada'), '2026-10-01', '2026-10-31', { estado: 'CONGELADA' });
      await svc.crearSocio(B, { nombre: 'Otro negocio' });
    });

    it('por vencer (7 días) y mora (vencidos); cada grupo con sus días y ordenado', async () => {
      const a = await svc.alertas(A);
      expect(a.porVencer.map((x: any) => [x.nombre, x.diasRestantes])).toEqual([['VenceHoy', 0], ['PorVencer', 5]]);
      expect(a.mora.map((x: any) => [x.nombre, x.diasVencida])).toEqual([['VencioHaceMes', 31], ['VencioAyer', 1]]);
    });

    it('con días de gracia, el que venció ayer todavía no cuenta como mora', async () => {
      cfg = { diasAviso: 7, diasGracia: 3 };
      const a = await svc.alertas(A);
      expect(a.mora.map((x: any) => x.nombre)).toEqual(['VencioHaceMes']);
    });

    it('con 2 días de aviso, solo los que vencen en 2 días o menos', async () => {
      cfg = { diasAviso: 2, diasGracia: 0 };
      expect((await svc.alertas(A)).porVencer.map((x: any) => x.nombre)).toEqual(['VenceHoy']);
    });

    it('reporte: activas (vigentes), por vencer, vencidas y congeladas, con su listado', async () => {
      const r: any = await svc.reporteMembresias(A);
      expect(r.conteo).toEqual({ socios: 7, vigentes: 3, porVencer: 2, vencidas: 2, congeladas: 1, programadas: 0, sinMembresia: 1 });
      expect((await svc.reporteMembresias(A, 'vencidas') as any).detalle.map((d: any) => d.nombre).sort()).toEqual(['VencioAyer', 'VencioHaceMes']);
      expect((await svc.reporteMembresias(A, 'vigentes') as any).detalle.map((d: any) => d.nombre).sort()).toEqual(['PorVencer', 'VenceHoy', 'Vigente']);
    });

    it('aislamiento: el negocio B no ve nada de A', async () => {
      const r: any = await svc.reporteMembresias(B);
      expect(r.conteo).toMatchObject({ socios: 1, vigentes: 0, sinMembresia: 1 });
      expect((await svc.alertas(B)).porVencer).toEqual([]);
    });
  });

  describe('ingresos por concepto', () => {
    beforeEach(() => {
      categorias.push({ id: 'c-bebidas', name: 'Bebidas' });
      productos.push(
        { id: 'p-agua', tenantId: A, name: 'Agua', categoryId: 'c-bebidas', esServicio: false },
        { id: 'p-clase', tenantId: A, name: 'Clase suelta', categoryId: null, esServicio: true },
        { id: 'p-plan', tenantId: A, name: 'Membresía: Mensual', categoryId: null, esServicio: true },
      );
      planes.push({ id: 'pl', tenantId: A, nombre: 'Mensual', productId: 'p-plan' });
      const venta = (id: string, status: string, fecha: string, items: any[], total: number, impuestos: number, extra: any = {}) =>
        ventas.push({ id, tenantId: A, status, fecha, items, total, impuestos, sucursalId: 's1', ...extra });
      // V1: membresía 500 + IVA 80 = 580
      venta('v1', 'PAGADA', '2026-10-02', [{ productoId: 'p-plan', subtotal: 500, tasaIva: '16' }], 580, 80);
      // V2: 2 aguas $50 + clase $100, sin IVA en la clase (exenta) → 100 + 100 + IVA 16 = 216
      venta('v2', 'PAGADA', '2026-10-03', [{ productoId: 'p-agua', subtotal: 100, tasaIva: '16' }, { productoId: 'p-clase', subtotal: 100, tasaIva: 'EXENTO' }], 216, 16);
      // V3: devuelta (cuenta como venta) y su devolución resta en su fecha
      venta('v3', 'DEVUELTA', '2026-10-01', [{ productoId: 'p-agua', subtotal: 50, tasaIva: '16' }], 58, 8);
      venta('d3', 'DEVOLUCION', '2026-10-04', [{ productoId: 'p-agua', subtotal: 50, tasaIva: '16' }], 58, 8);
      // fuera de rango y de otro negocio
      venta('v4', 'PAGADA', '2026-09-01', [{ productoId: 'p-agua', subtotal: 1000, tasaIva: '16' }], 1160, 160);
      venta('vB', 'PAGADA', '2026-10-02', [{ productoId: 'p-agua', subtotal: 999, tasaIva: '16' }], 1158.84, 159.84, { tenantId: B });
    });

    it('del 1 al 5 de octubre: membresías, bebidas y servicios por concepto, con base, IVA y total', async () => {
      const r = await svc.ingresosPorConcepto(A, '2026-10-01', '2026-10-05');
      const c = Object.fromEntries(r.conceptos.map((x) => [x.concepto, x]));
      expect(c['Membresías']).toMatchObject({ base: 500, impuestos: 80, total: 580 });
      expect(c['Servicios']).toMatchObject({ base: 100, impuestos: 0, total: 100 });
      // bebidas: V2 aguas 100 + IVA 16, V3 venta 50 + IVA 8, menos la devolución D3 50 + IVA 8 = 100 + IVA 16
      expect(c['Bebidas']).toMatchObject({ base: 100, impuestos: 16, total: 116 });
      expect(r.total).toEqual({ base: 700, impuestos: 96, total: 796 });
    });

    it('el rango excluye lo de fuera y el otro negocio no suma', async () => {
      const r = await svc.ingresosPorConcepto(A, '2026-10-05', '2026-10-31');
      expect(r.conceptos).toEqual([]);
      const b = await svc.ingresosPorConcepto(B, '2026-10-01', '2026-10-05');
      // B solo ve SU venta (999); nada de lo de A (580, 216...) entra a su reporte
      expect(b.total.base).toBe(999);
      expect(b.conceptos.map((x) => x.concepto)).toEqual(['Sin categoría']);
    });

    it('fechas inválidas: 400', async () => {
      await expect(svc.ingresosPorConcepto(A, '01/10/2026', '2026-10-05')).rejects.toThrow(BadRequestException);
      await expect(svc.ingresosPorConcepto(A, '2026-10-05', '2026-10-01')).rejects.toThrow(BadRequestException);
    });
  });

  // ── límite de intentos fallidos del check-in (el limitador del login por NIP del POS, con llaves propias) ─────────────
  describe('check-in — límite de intentos fallidos', () => {
    const actor = { email: 'rec@gym', branchId: 'suc-1' };
    const IP = '10.0.0.1';
    let ana: any;
    let throttle: NipThrottleService;

    beforeEach(async () => {
      ana = await svc.crearSocio(A, { nombre: 'Ana', nip: '4321' });
      throttle = (svc as any).nipThrottle;
    });

    const fallarNips = async (n: number, ip = IP, tenant = A) => {
      for (let i = 0; i < n; i++) await svc.checkin(tenant, { nip: String(1000 + i) }, actor, ip);
    };
    const estatus = (e: any) => e?.getStatus?.();

    it(`${NIP_LIMITS.tenantIp} NIP inexistentes desde la misma IP y el siguiente intento da 429; ni el NIP correcto entra desde esa IP`, async () => {
      periodo(ana.id, '2026-10-01', '2026-10-31');
      await fallarNips(NIP_LIMITS.tenantIp);
      const err: any = await svc.checkin(A, { nip: '1234' }, actor, IP).catch((e) => e);
      expect(estatus(err)).toBe(429);
      expect(err.message).toMatch(/Demasiados intentos fallidos/);
      const conElBueno: any = await svc.checkin(A, { nip: '4321' }, actor, IP).catch((e) => e);
      expect(estatus(conElBueno)).toBe(429);
      expect(checkins).toHaveLength(0); // y no quedó ningún check-in
    });

    it('otra IP del mismo negocio sigue pudiendo entrar (varias recepciones detrás de IPs distintas no se bloquean)', async () => {
      periodo(ana.id, '2026-10-01', '2026-10-31');
      await fallarNips(NIP_LIMITS.tenantIp);
      expect(await svc.checkin(A, { nip: '4321' }, actor, '10.0.0.2')).toMatchObject({ permitido: true });
    });

    it(`tope por negocio: ${NIP_LIMITS.tenant} fallos repartidos en IPs distintas bloquean a todo el negocio, no a otro negocio`, async () => {
      periodo(ana.id, '2026-10-01', '2026-10-31');
      for (let i = 0; i < NIP_LIMITS.tenant; i++) await svc.checkin(A, { nip: String(1000 + i) }, actor, `10.1.0.${i % 5}-${Math.floor(i / 5)}`);
      const err: any = await svc.checkin(A, { nip: '4321' }, actor, '10.9.9.9').catch((e) => e);
      expect(estatus(err)).toBe(429);
      // otro negocio, misma IP: intacto
      const beto = await svc.crearSocio(B, { nombre: 'Beto', nip: '4321' });
      membresias.push({ id: 'mb', tenantId: B, socioId: beto.id, estado: 'ACTIVA', fechaInicio: '2026-10-01', fechaFin: '2026-10-31' });
      expect(await svc.checkin(B, { nip: '4321' }, actor, '10.9.9.9')).toMatchObject({ permitido: true });
    });

    it(`número + NIP: ${NIP_LIMITS.userIp} NIP equivocados para el MISMO socio desde la misma IP lo bloquean; con el NIP correcto de golpe limpia`, async () => {
      periodo(ana.id, '2026-10-01', '2026-10-31');
      for (let i = 0; i < NIP_LIMITS.userIp; i++) {
        expect(await svc.checkin(A, { numero: '1', nip: '000' + i }, actor, IP)).toEqual({ permitido: false, motivo: 'Socio o NIP incorrectos.' });
      }
      const err: any = await svc.checkin(A, { numero: '1', nip: '4321' }, actor, IP).catch((e) => e);
      expect(estatus(err)).toBe(429);
      // desde otra IP todavía puede (el tope del socio es por IP: 5; el del socio en total: 10)
      expect(await svc.checkin(A, { numero: '1', nip: '4321' }, actor, '10.0.0.7')).toMatchObject({ permitido: true });
    });

    it('un NIP correcto limpia los contadores de ese socio en esa IP: se puede volver a equivocar sin bloqueo', async () => {
      periodo(ana.id, '2026-10-01', '2026-10-31');
      for (let i = 0; i < NIP_LIMITS.userIp - 1; i++) await svc.checkin(A, { numero: '1', nip: '000' + i }, actor, IP);
      expect(await svc.checkin(A, { numero: '1', nip: '4321' }, actor, IP)).toMatchObject({ permitido: true });
      for (let i = 0; i < NIP_LIMITS.userIp - 1; i++) {
        expect(await svc.checkin(A, { numero: '1', nip: '111' + i }, actor, IP)).toMatchObject({ permitido: false });
      }
    });

    it('un número de socio que no existe cuenta como fallo (barrido de números)', async () => {
      for (let i = 0; i < NIP_LIMITS.tenantIp; i++) await svc.checkin(A, { numero: `9${i}` }, actor, IP);
      const err: any = await svc.checkin(A, { numero: '1' }, actor, IP).catch((e) => e);
      expect(estatus(err)).toBe(429);
    });

    it('una membresía vencida NO es un fallo: 30 check-ins denegados por vencida no bloquean a nadie', async () => {
      periodo(ana.id, '2026-08-01', '2026-08-31');
      for (let i = 0; i < 30; i++) {
        expect(await svc.checkin(A, { numero: '1' }, actor, IP)).toMatchObject({ permitido: false });
      }
      expect(await svc.checkin(A, { nip: '4321' }, actor, IP)).toMatchObject({ permitido: false, motivo: expect.stringMatching(/venció/) });
    });

    it('los fallos de aquí NO bloquean el login por NIP del POS (llaves separadas en el mismo limitador)', async () => {
      await fallarNips(NIP_LIMITS.tenantIp);
      expect(() => throttle.assertAllowed(A, undefined, IP)).not.toThrow();
      expect(() => throttle.assertAllowed(A, 'u-cajero', IP)).not.toThrow();
    });

    it('pasada la ventana de 15 minutos el bloqueo termina', async () => {
      periodo(ana.id, '2026-10-01', '2026-10-31');
      let ahora = 1_000_000;
      throttle.now = () => ahora;
      await fallarNips(NIP_LIMITS.tenantIp);
      expect(estatus(await svc.checkin(A, { nip: '4321' }, actor, IP).catch((e) => e))).toBe(429);
      ahora += 16 * 60 * 1000;
      expect(await svc.checkin(A, { nip: '4321' }, actor, IP)).toMatchObject({ permitido: true });
    });
  });

});

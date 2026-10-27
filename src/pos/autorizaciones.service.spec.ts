import { BadRequestException, ForbiddenException, HttpException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AutorizacionesService } from './autorizaciones.service';
import { redactar, MASCARA } from '../audit/redactar';
import { hashCuenta, hashLineas, hashToken, MOTIVOS_CORTESIA, MOTIVOS_DESCUENTO, TTL_AUTORIZACION_MS } from './autorizaciones.util';

// Autorización de cortesías y descuentos sobre el tope: emitir (contraseña ERP del gerente/admin) y gastar el token (un solo uso, 2 min,
// mismo negocio, mismo solicitante, mismas líneas). Servicio REAL sobre repositorios en memoria.
const TENANT_A = 'tenant-A';
const TENANT_B = 'tenant-B';
const CLAVE = 'clave-del-gerente-123';

const cajero = { id: 'u-cajero', email: 'cajero@erp', roleCode: 'CAJERO', tenantId: TENANT_A, branchId: 'suc-1' };
const ITEMS = [{ productoId: 'p-1', cantidad: 2, descuento: 100 }];

describe('AutorizacionesService', () => {
  let svc: AutorizacionesService;
  let filas: any[];
  let usuarios: any[];
  let bitacora: any[];
  let hashClave: string;
  let ahora: number;

  const coincide = (fila: any, where: any) =>
    Object.entries(where || {}).every(([k, v]: [string, any]) => {
      if (v && typeof v === 'object' && v._type === 'in') return v._value.includes(fila[k]);
      if (v && typeof v === 'object' && v._type === 'isNull') return fila[k] === null || fila[k] === undefined;
      return fila[k] === v;
    });

  beforeAll(async () => { hashClave = await bcrypt.hash(CLAVE, 4); });

  beforeEach(() => {
    filas = [];
    bitacora = [];
    ahora = Date.parse('2026-10-05T14:00:00Z');
    usuarios = [
      { id: 'g1', name: 'Gina Gerente', email: 'gerente@erp', roleCode: 'GERENTE', tenantId: TENANT_A, branchId: 'suc-1', isActive: true, password: hashClave },
      { id: 'g2', name: null, email: 'gerente2@erp', roleCode: 'GERENTE', tenantId: TENANT_A, branchId: 'suc-2', isActive: true, password: hashClave },
      { id: 'a1', name: 'Ana Admin', email: 'admin@erp', roleCode: 'ADMIN', tenantId: TENANT_A, branchId: null, isActive: true, password: hashClave },
      { id: 'gx', name: 'Inactivo', email: 'inactivo@erp', roleCode: 'GERENTE', tenantId: TENANT_A, branchId: null, isActive: false, password: hashClave },
      { id: 'c9', name: 'Otro cajero', email: 'cajero9@erp', roleCode: 'CAJERO', tenantId: TENANT_A, branchId: 'suc-1', isActive: true, password: hashClave },
      { id: 'gB', name: 'Gerente B', email: 'gerente@b', roleCode: 'GERENTE', tenantId: TENANT_B, branchId: null, isActive: true, password: hashClave },
    ];
    const repo: any = {
      create: (d: any) => ({ ...d }),
      save: jest.fn((d: any) => { const f = { id: `aut-${filas.length + 1}`, createdAt: new Date(ahora), ...d }; filas.push(f); return Promise.resolve(f); }),
      findOne: jest.fn(({ where }: any) => Promise.resolve(filas.find((f) => coincide(f, where)) ?? null)),
      update: jest.fn((where: any, patch: any) => {
        const f = filas.find((x) => coincide(x, where));
        if (f) Object.assign(f, patch);
        return Promise.resolve({ affected: f ? 1 : 0 });
      }),
    };
    const users: any = {
      find: jest.fn(({ where }: any) => Promise.resolve(usuarios.filter((u) => coincide(u, where)).map(({ password: _p, ...u }) => u))),
      findOne: jest.fn(({ where }: any) => Promise.resolve(usuarios.find((u) => coincide(u, where)) ?? null)),
    };
    const audit: any = { createLog: jest.fn((d: any) => { bitacora.push(d); return Promise.resolve(d); }) };
    svc = new AutorizacionesService(repo, users, audit);
    svc.now = () => ahora;
  });

  const pedir = (extra: Record<string, any> = {}, actor: any = cajero) =>
    svc.emitir({ autorizadorId: 'g1', contrasena: CLAVE, tipo: 'CORTESIA', motivo: 'cliente_vip', items: ITEMS, ...extra }, actor, { ip: '1.1.1.1', userAgent: 'jest' });

  describe('autorizadores', () => {
    it('lista solo gerentes y admins activos del negocio, sin cajeros, inactivos ni otros negocios (y sin contraseñas)', async () => {
      const r = await svc.autorizadores({ ...cajero, branchId: null });
      expect(r.map((u) => u.email).sort()).toEqual(['admin@erp', 'gerente2@erp', 'gerente@erp']);
      expect(JSON.stringify(r)).not.toMatch(/password|\$2[aby]\$/);
    });
    it('con sucursal, ve a los admins y a los gerentes de la suya', async () => {
      const r = await svc.autorizadores(cajero);
      expect(r.map((u) => u.email).sort()).toEqual(['admin@erp', 'gerente@erp']);
    });
  });

  describe('emitir', () => {
    it('con la contraseña de un gerente entrega un token de 2 min ligado a las líneas; en la base solo queda su hash', async () => {
      const r = await pedir();
      expect(r.autorizadoPor).toMatchObject({ email: 'gerente@erp', rol: 'GERENTE' });
      expect(r.expiraEn.getTime()).toBe(ahora + TTL_AUTORIZACION_MS);
      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({ tenantId: TENANT_A, tipo: 'CORTESIA', motivo: 'cliente_vip', hashLineas: hashLineas(ITEMS), solicitadoPorId: 'u-cajero', usadoEn: null });
      expect(filas[0].tokenHash).toBe(hashToken(r.token));
      expect(JSON.stringify(filas)).not.toContain(r.token);
    });

    it('un administrador también puede autorizar', async () => {
      await expect(pedir({ autorizadorId: 'a1' })).resolves.toMatchObject({ autorizadoPor: { rol: 'ADMIN' } });
    });

    it('rol incorrecto: un cajero (o cualquier rol sin facultad) no puede ser el autorizador, aunque su contraseña sea correcta', async () => {
      await expect(pedir({ autorizadorId: 'c9' })).rejects.toThrow('Autorizador o contraseña incorrectos.');
      expect(filas).toHaveLength(0);
    });

    it('contraseña incorrecta, autorizador inexistente, inactivo o de otro negocio: el mismo 403, sin revelar cuál fue', async () => {
      for (const extra of [{ contrasena: 'mala' }, { autorizadorId: 'no-existe' }, { autorizadorId: 'gx' }, { autorizadorId: 'gB' }]) {
        const err: any = await pedir(extra).catch((e) => e);
        expect(err).toBeInstanceOf(ForbiddenException);
        expect(err.message).toBe('Autorizador o contraseña incorrectos.');
      }
      expect(filas).toHaveLength(0);
    });

    it('un gerente de otra sucursal no autoriza en esta caja; un admin sí', async () => {
      await expect(pedir({ autorizadorId: 'g2' })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(pedir({ autorizadorId: 'a1' })).resolves.toBeDefined();
    });

    it('motivo vacío, ausente o fuera de la lista: 400 (y no se pide ni la contraseña)', async () => {
      for (const motivo of [undefined, '', '   ', 'porque-si', 'promocion']) {
        await expect(pedir({ motivo })).rejects.toBeInstanceOf(BadRequestException);
      }
      await expect(pedir({ tipo: 'DESCUENTO', motivo: 'cliente_vip' })).rejects.toBeInstanceOf(BadRequestException);
      expect(filas).toHaveLength(0);
      expect(MOTIVOS_CORTESIA).toContain('cliente_vip');
      expect(MOTIVOS_DESCUENTO).toContain('promocion');
    });

    it('sin líneas ni cuenta a las que ligarla: 400; tipo inválido: 400; rol sin facultad para pedir (mesero): 403', async () => {
      await expect(pedir({ items: [] })).rejects.toBeInstanceOf(BadRequestException);
      await expect(pedir({ tipo: 'OTRO' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(pedir({}, { ...cajero, roleCode: 'MESERO' })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('después de 5 contraseñas malas desde la misma IP responde 429, aunque la siguiente sea la correcta; un acierto limpia el contador', async () => {
      for (let i = 0; i < 4; i++) await pedir({ contrasena: 'mala' }).catch(() => undefined);
      await expect(pedir()).resolves.toBeDefined();
      for (let i = 0; i < 5; i++) await pedir({ contrasena: 'mala' }).catch(() => undefined);
      const err: any = await pedir().catch((e) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(429);
    });

    it('sin secretos en la bitácora: ni la contraseña, ni el token, ni su hash', async () => {
      const r = await pedir();
      expect(bitacora).toHaveLength(1);
      expect(bitacora[0]).toMatchObject({ action: 'POS_AUTORIZACION_EMITIDA', entity: 'Sale', tenantId: TENANT_A, userEmail: 'cajero@erp' });
      const texto = JSON.stringify(bitacora);
      expect(texto).not.toContain(CLAVE);
      expect(texto).not.toContain(r.token);
      expect(texto).not.toContain(hashToken(r.token));
      expect(texto).not.toMatch(/\$2[aby]\$/);
    });
  });

  describe('consumir', () => {
    const consumir = (token: string, extra: Record<string, any> = {}) =>
      svc.consumir({ token, tenantId: TENANT_A, hash: hashLineas(ITEMS), actor: cajero, ...extra });

    it('entrega quién autorizó, el tipo y el motivo, y marca el token como usado', async () => {
      const { token } = await pedir();
      await expect(consumir(token)).resolves.toMatchObject({ tipo: 'CORTESIA', motivo: 'cliente_vip', autorizadoPorEmail: 'gerente@erp', autorizadoPorRol: 'GERENTE' });
      expect(filas[0].usadoEn).toBeInstanceOf(Date);
    });

    it('reusado: el segundo uso es 403', async () => {
      const { token } = await pedir();
      await consumir(token);
      await expect(consumir(token)).rejects.toThrow(/ya se usó/);
    });

    it('vencido: pasados 2 minutos es 403', async () => {
      const { token } = await pedir();
      ahora += TTL_AUTORIZACION_MS + 1;
      await expect(consumir(token)).rejects.toThrow(/venció/);
      expect(filas[0].usadoEn).toBeNull();
    });

    it('otro tenant: un token de un negocio no sirve en otro (mismo mensaje que un token inventado)', async () => {
      const { token } = await pedir();
      const ajeno: any = await consumir(token, { tenantId: TENANT_B }).catch((e) => e);
      const inventado: any = await consumir('token-inventado').catch((e) => e);
      expect(ajeno).toBeInstanceOf(ForbiddenException);
      expect(ajeno.message).toBe(inventado.message);
      expect(filas[0].usadoEn).toBeNull();
    });

    it('otro ticket: si cambian las líneas (cantidad, descuento o productos) después de autorizar, es 403 y el token sigue sin gastarse', async () => {
      const { token } = await pedir();
      for (const items of [[{ productoId: 'p-1', cantidad: 3, descuento: 100 }], [{ productoId: 'p-1', cantidad: 2, descuento: 50 }], [...ITEMS, { productoId: 'p-2', cantidad: 1, descuento: 0 }]]) {
        await expect(consumir(token, { hash: hashLineas(items) })).rejects.toThrow(/no corresponde a este ticket/);
      }
      expect(filas[0].usadoEn).toBeNull();
    });

    it('otro solicitante: solo quien pidió la autorización la puede usar', async () => {
      const { token } = await pedir();
      await expect(consumir(token, { actor: { ...cajero, id: 'u-otro' } })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('si el autorizador se desactiva o deja de ser gerente antes de usarla, ya no vale', async () => {
      const a = await pedir();
      usuarios.find((u) => u.id === 'g1').isActive = false;
      await expect(consumir(a.token)).rejects.toThrow(/ya no puede autorizar/);
      usuarios.find((u) => u.id === 'g1').isActive = true;
      usuarios.find((u) => u.id === 'g1').roleCode = 'CAJERO';
      await expect(consumir(a.token)).rejects.toThrow(/ya no puede autorizar/);
    });

    it('descuento de cuenta: ligado a la cuenta y al importe del descuento', async () => {
      const { token } = await svc.emitir({ autorizadorId: 'g1', contrasena: CLAVE, tipo: 'DESCUENTO', motivo: 'promocion', ventaId: 'venta-1', descuento: 30 }, cajero);
      await expect(consumir(token, { hash: hashCuenta('venta-1', 31) })).rejects.toThrow(/no corresponde/);
      await expect(consumir(token, { hash: hashCuenta('venta-2', 30) })).rejects.toThrow(/no corresponde/);
      await expect(consumir(token, { hash: hashCuenta('venta-1', 30) })).resolves.toMatchObject({ tipo: 'DESCUENTO', motivo: 'promocion' });
    });

    it('el registro automático de la bitácora (POST/PUT) enmascara la contraseña y el token del cuerpo', () => {
      const cuerpo: any = redactar({ autorizadorId: 'g1', contrasena: CLAVE, tipo: 'CORTESIA', motivo: 'cliente_vip', autorizacion: { token: 'secreto-1' } });
      expect(cuerpo.contrasena).toBe(MASCARA);
      expect(cuerpo.autorizacion.token).toBe(MASCARA);
      expect(JSON.stringify(cuerpo)).not.toMatch(/secreto-1|clave-del-gerente/);
    });

    it('registrarUso escribe la entrada sin secretos', async () => {
      await svc.registrarUso('POS_CORTESIA', cajero, TENANT_A, { ventaId: 'v1', folio: 'VTA-1', tipo: 'CORTESIA', motivo: 'cliente_vip', autorizadoPor: 'gerente@erp', via: 'TOKEN', monto: 116 }, { ip: '1.1.1.1' });
      expect(bitacora[0]).toMatchObject({ action: 'POS_CORTESIA', details: { motivo: 'cliente_vip', autorizadoPor: 'gerente@erp', cobradoPor: 'cajero@erp', monto: 116 } });
    });
  });
});

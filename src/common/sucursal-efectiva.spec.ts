import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  assertSucursalDelTenant,
  assertSucursalLegible,
  sucursalEfectiva,
  sucursalParaEscribir,
  sucursalPerteneceAlTenant,
} from './sucursal-efectiva';

// Sucursal efectiva: una sola regla para todos los módulos.
describe('sucursalEfectiva (lecturas)', () => {
  it('usuario con sucursal: solo la suya, el header se ignora (no es un permiso)', () => {
    expect(sucursalEfectiva({ branchId: 'suc-1', roleCode: 'CAJERO' }, 'suc-2')).toEqual({ branchId: 'suc-1', restringida: true });
    expect(sucursalEfectiva({ branchId: 'suc-1', roleCode: 'GERENTE' }, undefined)).toEqual({ branchId: 'suc-1', restringida: true });
  });

  it('ADMIN sin sucursal: ve todo el tenant sin header, o filtra por la que elige', () => {
    expect(sucursalEfectiva({ branchId: null, roleCode: 'ADMIN' }, undefined)).toEqual({ branchId: undefined, restringida: false });
    expect(sucursalEfectiva({ roleCode: 'ADMIN' }, '')).toEqual({ branchId: undefined, restringida: false });
    expect(sucursalEfectiva({ roleCode: 'ADMIN' }, ' suc-9 ')).toEqual({ branchId: 'suc-9', restringida: false });
  });

  it('sin usuario (SOPORTE sin token de negocio): lo pedido o nada', () => {
    expect(sucursalEfectiva(undefined, 'x')).toEqual({ branchId: 'x', restringida: false });
    expect(sucursalEfectiva(null, undefined)).toEqual({ branchId: undefined, restringida: false });
  });

  it('un branchId con solo espacios en el token no cuenta como sucursal', () => {
    expect(sucursalEfectiva({ branchId: '  ' }, 'suc-2')).toEqual({ branchId: 'suc-2', restringida: false });
  });
});

describe('sucursalParaEscribir (escrituras)', () => {
  it('con sucursal en el token: es esa; pedir otra es 403; pedir la misma o nada, no', () => {
    expect(sucursalParaEscribir({ branchId: 'suc-1' }, undefined)).toBe('suc-1');
    expect(sucursalParaEscribir({ branchId: 'suc-1' }, 'suc-1')).toBe('suc-1');
    expect(() => sucursalParaEscribir({ branchId: 'suc-1' }, 'suc-2')).toThrow(ForbiddenException);
  });

  it('sin sucursal en el token: la pedida, o ninguna', () => {
    expect(sucursalParaEscribir({ roleCode: 'ADMIN' }, 'suc-2')).toBe('suc-2');
    expect(sucursalParaEscribir({ roleCode: 'ADMIN' }, undefined)).toBeUndefined();
  });
});

describe('pertenencia de la sucursal al tenant', () => {
  const runner = (filas: any[]) => ({ query: jest.fn().mockResolvedValue(filas) });

  it('consulta branch → company → tenant con ambos parámetros', async () => {
    const r = runner([{ '?column?': 1 }]);
    await expect(sucursalPerteneceAlTenant(r, 'suc-1', 'tenant-A')).resolves.toBe(true);
    expect(r.query).toHaveBeenCalledWith(expect.stringContaining('"company"'), ['suc-1', 'tenant-A']);
  });

  it('una sucursal que no es del tenant (o no existe): false; assertDelTenant → 400; assertLegible → 403', async () => {
    const r = runner([]);
    await expect(sucursalPerteneceAlTenant(r, 'suc-B', 'tenant-A')).resolves.toBe(false);
    await expect(assertSucursalDelTenant(r, 'suc-B', 'tenant-A')).rejects.toThrow(BadRequestException);
    await expect(assertSucursalLegible(r, 'suc-B', 'tenant-A')).rejects.toThrow(ForbiddenException);
  });

  it('sin sucursal o sin tenant (SOPORTE) no consulta ni rechaza', async () => {
    const r = runner([]);
    await expect(assertSucursalDelTenant(r, undefined, 'tenant-A')).resolves.toBeUndefined();
    await expect(assertSucursalLegible(r, 'suc-1', undefined)).resolves.toBeUndefined();
    expect(r.query).not.toHaveBeenCalled();
  });
});

import { BadRequestException } from '@nestjs/common';
import { HrService } from './hr.service';
import { parseFiltrosSolicitudes } from './pending-requests.query';

function fakeQb(rows: any[], total = rows.length) {
  const qb: any = { wheres: [] as Array<[string, any]>, skip: undefined, take: undefined };
  qb.andWhere = jest.fn((sql: string, p: any) => { qb.wheres.push([sql, p]); return qb; });
  qb.orderBy = jest.fn(() => qb);
  qb.addOrderBy = jest.fn(() => qb);
  qb.skip = jest.fn((n: number) => { qb.skipN = n; return qb; });
  qb.take = jest.fn((n: number) => { qb.takeN = n; return qb; });
  qb.getManyAndCount = jest.fn(async () => [rows, total]);
  return qb;
}

function servicio(vacRows: any[], permRows: any[], empleados: any[], totals: [number?, number?] = []) {
  const vacQb = fakeQb(vacRows, totals[0]);
  const permQb = fakeQb(permRows, totals[1]);
  const empFind = jest.fn(async () => empleados);
  const svc = new HrService(
    { find: empFind } as any, {} as any,
    { createQueryBuilder: () => vacQb } as any,
    { createQueryBuilder: () => permQb } as any,
    {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
  );
  return { svc, vacQb, permQb, empFind };
}

describe('parseFiltrosSolicitudes', () => {
  it('sin parámetros: pendientes, página 1, 25 por página', () => {
    expect(parseFiltrosSolicitudes({})).toEqual({ estado: 'PENDIENTE', desde: undefined, hasta: undefined, employeeId: undefined, page: 1, limit: 25 });
  });
  it('TODAS quita el filtro de estado; el estado no distingue mayúsculas', () => {
    expect(parseFiltrosSolicitudes({ estado: 'todas' }).estado).toBeUndefined();
    expect(parseFiltrosSolicitudes({ estado: 'aprobada' }).estado).toBe('APROBADA');
  });
  it.each([
    [{ estado: 'BORRADA' }], [{ desde: '2026-13-01' }], [{ hasta: '2026-02-30' }], [{ desde: '24/10/2026' }],
    [{ desde: '2026-10-10', hasta: '2026-10-01' }], [{ page: '0' }], [{ page: 'x' }], [{ limit: '0' }], [{ limit: '101' }], [{ limit: '2.5' }],
  ])('rechaza %j', (q) => {
    expect(() => parseFiltrosSolicitudes(q as any)).toThrow(BadRequestException);
  });
});

describe('HrService.findPendingRequests', () => {
  const emp = { id: 'e1', nombre: 'María', apellidos: 'García', puesto: 'Cajera', tenantId: 'T1' };

  it('siempre acota por el tenant recibido (el del token) y por estado PENDIENTE por defecto', async () => {
    const { svc, vacQb, permQb } = servicio([], [], []);
    await svc.findPendingRequests('T1');
    for (const qb of [vacQb, permQb]) {
      expect(qb.wheres).toEqual(expect.arrayContaining([[expect.stringContaining('tenantId = :tenantId'), { tenantId: 'T1' }], [expect.stringContaining('status = :estado'), { estado: 'PENDIENTE' }]]));
    }
  });

  it('SOPORTE (tenant undefined) no agrega filtro de tenant', async () => {
    const { svc, vacQb } = servicio([], [], []);
    await svc.findPendingRequests(undefined);
    expect(vacQb.wheres.some(([s]: [string, any]) => s.includes('tenantId'))).toBe(false);
  });

  it('el empleado se busca también acotado por tenant (no resuelve nombres de otro tenant)', async () => {
    const { svc, empFind } = servicio([], [{ id: 'p1', employeeId: 'e1' }], [emp]);
    await svc.findPendingRequests('T1');
    const where = (empFind.mock.calls[0] as any[])[0].where;
    expect(where.tenantId).toBe('T1');
  });

  it('devuelve nombre y puesto; null si el empleado no existe', async () => {
    const { svc } = servicio([{ id: 'v1', employeeId: 'e1' }], [{ id: 'p1', employeeId: 'huerfano' }], [emp]);
    const r = await svc.findPendingRequests('T1');
    expect(r.vacaciones[0]).toMatchObject({ employeeNombre: 'María García', employeePuesto: 'Cajera' });
    expect(r.permisos[0]).toMatchObject({ employeeNombre: null, employeePuesto: null });
  });

  it('aplica employeeId y rangos: traslape en vacaciones, fecha en permisos', async () => {
    const { svc, vacQb, permQb } = servicio([], [], []);
    await svc.findPendingRequests('T1', parseFiltrosSolicitudes({ estado: 'TODAS', employeeId: 'e1', desde: '2026-10-01', hasta: '2026-10-31' }));
    const sqlV = vacQb.wheres.map(([s]: [string, any]) => s).join(' | ');
    const sqlP = permQb.wheres.map(([s]: [string, any]) => s).join(' | ');
    expect(sqlV).toContain('v.endDate >= :desde');
    expect(sqlV).toContain('v.startDate <= :hasta');
    expect(sqlV).toContain('v.employeeId = :employeeId');
    expect(sqlV).not.toContain('status');
    expect(sqlP).toContain('p.date >= :desde');
    expect(sqlP).toContain('p.date <= :hasta');
  });

  it('pagina: página 3 de 25 salta 50; reporta total y página', async () => {
    const { svc, vacQb, permQb } = servicio([], [{ id: 'p', employeeId: 'e1' }], [emp], [2, 62]);
    const r = await svc.findPendingRequests('T1', parseFiltrosSolicitudes({ page: '3' }));
    expect(vacQb.skipN).toBe(50); expect(permQb.takeN).toBe(25);
    expect(r).toMatchObject({ totalVacaciones: 2, totalPermisos: 62, total: 64, page: 3, limit: 25 });
  });
});

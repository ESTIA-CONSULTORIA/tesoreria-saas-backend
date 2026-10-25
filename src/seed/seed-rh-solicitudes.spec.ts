import { sembrarSolicitudesRHDemo } from './seed-rh-solicitudes';

/** Repo en memoria que respeta los `where` planos que usa el seed. */
function repoEnMemoria() {
  const filas: any[] = [];
  return {
    filas,
    findOne: jest.fn(async ({ where }: any) => filas.find(f => Object.entries(where).every(([k, v]) => String(f[k]) === String(v))) ?? null),
    save: jest.fn(async (d: any) => { filas.push({ ...d }); return d; }),
  };
}

const T = 'tenant-demo';

describe('sembrarSolicitudesRHDemo', () => {
  it('primera corrida: 2 vacaciones y 1 permiso', async () => {
    const vac = repoEnMemoria(), perm = repoEnMemoria();
    const n = await sembrarSolicitudesRHDemo(vac, perm, { tenantId: T, juan: { id: 'j1' }, carlos: { id: 'c1' }, maria: { id: 'm1' } });
    expect(n).toBe(3);
    expect(vac.filas).toHaveLength(2);
    expect(perm.filas).toHaveLength(1);
    expect(vac.filas.find(v => v.employeeId === 'c1').status).toBe('APROBADA');
  });

  it('60 arranques en días distintos no agregan permisos (el bug: uno por día)', async () => {
    const vac = repoEnMemoria(), perm = repoEnMemoria();
    for (let d = 0; d < 60; d++) {
      await sembrarSolicitudesRHDemo(vac, perm, { tenantId: T, juan: { id: 'j1' }, carlos: { id: 'c1' }, maria: { id: 'm1' }, hoy: new Date(2026, 5, 18 + d) });
    }
    expect(perm.filas).toHaveLength(1);
    expect(vac.filas).toHaveLength(2);
  });

  it('si el empleado se re-crea con otro id, no duplica la vacación ni el permiso', async () => {
    const vac = repoEnMemoria(), perm = repoEnMemoria();
    await sembrarSolicitudesRHDemo(vac, perm, { tenantId: T, juan: { id: 'j1' }, maria: { id: 'm1' } });
    const n = await sembrarSolicitudesRHDemo(vac, perm, { tenantId: T, juan: { id: 'j2-nuevo' }, maria: { id: 'm2-nuevo' } });
    expect(n).toBe(0);
    expect(vac.filas).toHaveLength(1);
    expect(perm.filas).toHaveLength(1);
  });

  it('otro tenant sí recibe su propio juego de ejemplo', async () => {
    const vac = repoEnMemoria(), perm = repoEnMemoria();
    await sembrarSolicitudesRHDemo(vac, perm, { tenantId: 'A', juan: { id: 'j' }, maria: { id: 'm' } });
    const n = await sembrarSolicitudesRHDemo(vac, perm, { tenantId: 'B', juan: { id: 'j' }, maria: { id: 'm' } });
    expect(n).toBe(2);
  });

  it('sin empleados no crea nada', async () => {
    const vac = repoEnMemoria(), perm = repoEnMemoria();
    expect(await sembrarSolicitudesRHDemo(vac, perm, { tenantId: T })).toBe(0);
  });

  it('el permiso queda con fecha de mañana relativa a "hoy"', async () => {
    const vac = repoEnMemoria(), perm = repoEnMemoria();
    await sembrarSolicitudesRHDemo(vac, perm, { tenantId: T, maria: { id: 'm' }, hoy: new Date(2026, 9, 24, 12) });
    expect(perm.filas[0].date).toBe('2026-10-25');
  });
});

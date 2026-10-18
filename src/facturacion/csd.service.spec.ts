import { BadRequestException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { CsdService } from './csd.service';
import { descifrarSecreto } from './csd-crypto';
import { CSD_OTRO_CER_B64, CSD_OTRO_KEY_B64, CSD_PRUEBA_CER_B64, CSD_PRUEBA_KEY_B64, CSD_PRUEBA_PASSWORD, CSD_PRUEBA_RFC } from './__fixtures__/csd-prueba';
import { FACTURACION_ACTIVABLE } from './facturacion-limites';
import { FacturacionService } from './facturacion.service';

const A = 'tenant-A';
const B = 'tenant-B';
const coincide = (f: any, where: any) => Object.entries(where).every(([k, v]) => f[k] === v);
function repo(filas: any[]) {
  let n = 0;
  return {
    filas,
    find: jest.fn(async ({ where }: any = {}) => filas.filter((f) => coincide(f, where ?? {}))),
    findOne: jest.fn(async ({ where }: any) => filas.find((f) => coincide(f, where)) ?? null),
    create: jest.fn((d: any) => ({ ...d })),
    save: jest.fn(async (d: any) => {
      const hay = d.id ? filas.find((f) => f.id === d.id) : undefined;
      if (hay) return Object.assign(hay, d);
      const nueva = { ...d, id: `csd-${++n}`, createdAt: new Date() };
      filas.push(nueva);
      return nueva;
    }),
  };
}

function montar() {
  const csds = repo([]);
  const emisores = repo([
    { tenantId: A, companyId: 'co-A', rfc: CSD_PRUEBA_RFC },
    { tenantId: B, companyId: 'co-B', rfc: 'XAXX010101000' },
  ]);
  const companies = repo([
    { id: 'co-A', tenantId: A },
    { id: 'co-B', tenantId: B },
    { id: 'co-A-sin-emisor', tenantId: A },
  ]);
  return { svc: new CsdService(csds as any, emisores as any, companies as any), csds };
}
const cuerpo = { cerB64: CSD_PRUEBA_CER_B64, keyB64: CSD_PRUEBA_KEY_B64, password: CSD_PRUEBA_PASSWORD };

describe('CSD — carga y custodia', () => {
  const original = process.env.ENCRYPTION_KEY;
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = 'k'.repeat(40);
  });
  afterAll(() => {
    if (original === undefined) delete process.env.ENCRYPTION_KEY; else process.env.ENCRYPTION_KEY = original;
  });

  it('valida, cifra la llave y la contraseña (contexto tenant|empresa) y responde SOLO el estado', async () => {
    const { svc, csds } = montar();
    const e = await svc.cargar(A, 'co-A', cuerpo, 'admin@a');
    expect(e).toMatchObject({ cargado: true, rfc: CSD_PRUEBA_RFC, numeroCertificado: '30001000000500003426', vencido: false, cargadoPor: 'admin@a' });
    const respuesta = JSON.stringify(e);
    expect(respuesta).not.toMatch(/keyCifrado|passwordCifrado|keyB64|12345678a/);
    expect(respuesta).not.toContain(CSD_PRUEBA_KEY_B64.slice(0, 40));

    const fila = csds.filas[0];
    expect(fila.keyCifrado.startsWith('v2:gcm:')).toBe(true);
    expect(fila.passwordCifrado.startsWith('v2:gcm:')).toBe(true);
    expect(fila.keyCifrado).not.toContain(CSD_PRUEBA_KEY_B64.slice(0, 40));
    expect(descifrarSecreto(fila.passwordCifrado, `${A}|co-A|password`)).toBe(CSD_PRUEBA_PASSWORD);
    expect(descifrarSecreto(fila.keyCifrado, `${A}|co-A|key`)).toBe(CSD_PRUEBA_KEY_B64);
    // copiado a otra empresa/tenant, no abre
    expect(() => descifrarSecreto(fila.passwordCifrado, `${B}|co-B|password`)).toThrow();
    expect(fila.cerPem).toContain('BEGIN CERTIFICATE');
  });

  it('el estado de lectura nunca incluye secretos y refleja que no hay CSD', async () => {
    const { svc } = montar();
    expect(await svc.obtenerEstado(A, 'co-A')).toEqual({ cargado: false });
    await svc.cargar(A, 'co-A', cuerpo, 'admin@a');
    const e = await svc.obtenerEstado(A, 'co-A');
    expect(e.cargado).toBe(true);
    expect(Object.keys(e).sort()).toEqual(['advertencias', 'cargadoPor', 'cargado', 'diasParaVencer', 'numeroCertificado', 'rfc', 'vencido', 'vigenteDesde', 'vigenteHasta'].sort());
  });

  it('reemplazar un CSD deja el anterior inactivo (uno solo activo por empresa)', async () => {
    const { svc, csds } = montar();
    await svc.cargar(A, 'co-A', cuerpo, 'admin@a');
    await svc.cargar(A, 'co-A', cuerpo, 'admin@a');
    expect(csds.filas.map((f: any) => f.activo)).toEqual([false, true]);
  });

  it('aislamiento: empresa de otro tenant → 404; no se lee ni se carga', async () => {
    const { svc } = montar();
    await expect(svc.cargar(B, 'co-A', cuerpo, 'x')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.obtenerEstado(B, 'co-A')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.desactivar(B, 'co-A')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sin emisor (RFC) capturado no se carga', async () => {
    const { svc } = montar();
    await expect(svc.cargar(A, 'co-A-sin-emisor', cuerpo, 'x')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('RFC del certificado distinto al de la empresa, llave que no corresponde o contraseña mala → 422 y no se guarda nada', async () => {
    const { svc, csds } = montar();
    await expect(svc.cargar(A, 'co-A', { cerB64: CSD_OTRO_CER_B64, keyB64: CSD_OTRO_KEY_B64, password: CSD_PRUEBA_PASSWORD }, 'x')).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(svc.cargar(A, 'co-A', { ...cuerpo, keyB64: CSD_OTRO_KEY_B64 }, 'x')).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(svc.cargar(A, 'co-A', { ...cuerpo, password: 'mala' }, 'x')).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(csds.filas).toHaveLength(0);
  });

  it('sin ENCRYPTION_KEY no se guarda, falla con error claro y NO se pierde el CSD anterior', async () => {
    const { svc, csds } = montar();
    await svc.cargar(A, 'co-A', cuerpo, 'admin@a');
    delete process.env.ENCRYPTION_KEY;
    await expect(svc.cargar(A, 'co-A', cuerpo, 'admin@a')).rejects.toThrow(/ENCRYPTION_KEY/);
    expect(csds.filas).toHaveLength(1);
    expect(csds.filas[0].activo).toBe(true);
  });

  it('desactivar quita el CSD activo', async () => {
    const { svc } = montar();
    await svc.cargar(A, 'co-A', cuerpo, 'admin@a');
    expect(await svc.desactivar(A, 'co-A')).toEqual({ cargado: false });
    expect(await svc.obtenerEstado(A, 'co-A')).toEqual({ cargado: false });
  });
});

describe('«Facturación activa» sigue bloqueada (P-03)', () => {
  it('el interruptor está apagado y el servidor rechaza encenderla', async () => {
    expect(FACTURACION_ACTIVABLE).toBe(false);
    const emisores = repo([]);
    const companies = repo([{ id: 'co-A', tenantId: A }]);
    const svc = new FacturacionService(emisores as any, repo([]) as any, repo([]) as any, repo([]) as any, companies as any, repo([]) as any, repo([]) as any);
    const base = { rfc: CSD_PRUEBA_RFC, nombreFiscal: 'ESCUELA KEMPER URGATE', regimenFiscal: '601' };
    await expect(svc.guardarEmisor(A, 'co-A', { ...base, facturacionActiva: true })).rejects.toThrow(/no se puede activar todavía/);
    const ok = await svc.guardarEmisor(A, 'co-A', { ...base, facturacionActiva: false });
    expect(ok.facturacionActiva).toBe(false);
    expect((await svc.guardarEmisor(A, 'co-A', base)).facturacionActiva).toBe(false);
  });
});

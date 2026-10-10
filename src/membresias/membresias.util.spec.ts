import {
  diasEntre, estadoEfectivo, finDePeriodo, hashNip, hoyLocal, inicioDeRenovacion, NIP_VALIDO, situacionDeSocio, sumarDias, sumarMeses, vigenteHoy,
} from './membresias.util';

const p = (fechaInicio: string, fechaFin: string, estado: 'ACTIVA' | 'CONGELADA' | 'CANCELADA' = 'ACTIVA', extra: Record<string, any> = {}) => ({
  fechaInicio, fechaFin, estado, ...extra,
});

describe('membresías — fechas', () => {
  it('hoyLocal usa la zona del negocio, no UTC: 2026-10-06 03:00 UTC sigue siendo 5 de octubre en Tijuana', () => {
    expect(hoyLocal(new Date('2026-10-06T03:00:00Z'), 'America/Tijuana')).toBe('2026-10-05');
    expect(hoyLocal(new Date('2026-10-06T03:00:00Z'), 'UTC')).toBe('2026-10-06');
  });

  it('sumarMeses no desborda: 31 de enero + 1 mes = 28 de febrero (29 en año bisiesto)', () => {
    expect(sumarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(sumarMeses('2028-01-31', 1)).toBe('2028-02-29');
    expect(sumarMeses('2026-11-30', 3)).toBe('2027-02-28');
    expect(sumarMeses('2026-12-15', 1)).toBe('2027-01-15');
  });

  it('finDePeriodo: último día incluido; los periodos consecutivos no se traslapan ni dejan hueco', () => {
    expect(finDePeriodo('2026-10-05', 'MESES', 1)).toBe('2026-11-04');
    expect(finDePeriodo('2026-11-05', 'MESES', 1)).toBe('2026-12-04');
    expect(finDePeriodo('2026-01-01', 'MESES', 1)).toBe('2026-01-31');
    expect(finDePeriodo('2026-10-05', 'DIAS', 30)).toBe('2026-11-03');
    expect(finDePeriodo('2026-10-05', 'DIAS', 1)).toBe('2026-10-05');
    expect(finDePeriodo('2026-10-05', 'ANOS', 1)).toBe('2027-10-04');
    expect(finDePeriodo('2026-01-31', 'MESES', 1)).toBe('2026-02-27');
  });

  it('sumarDias y diasEntre', () => {
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28');
    expect(diasEntre('2026-10-05', '2026-10-12')).toBe(7);
    expect(diasEntre('2026-10-12', '2026-10-05')).toBe(-7);
  });
});

describe('membresías — vigencia y situación del socio', () => {
  const hoy = '2026-10-10';

  it('el último día todavía entra; el siguiente ya no', () => {
    expect(vigenteHoy(p('2026-09-11', '2026-10-10') as any, hoy)).toBe(true);
    expect(vigenteHoy(p('2026-09-10', '2026-10-09') as any, hoy)).toBe(false);
    expect(vigenteHoy(p('2026-10-11', '2026-11-10') as any, hoy)).toBe(false); // todavía no empieza
  });

  it('una congelada o cancelada no deja entrar', () => {
    expect(vigenteHoy(p('2026-10-01', '2026-10-31', 'CONGELADA') as any, hoy)).toBe(false);
    expect(vigenteHoy(p('2026-10-01', '2026-10-31', 'CANCELADA') as any, hoy)).toBe(false);
  });

  it('estadoEfectivo: vencida se calcula, no se guarda', () => {
    expect(estadoEfectivo(p('2026-09-01', '2026-09-30') as any, hoy)).toBe('VENCIDA');
    expect(estadoEfectivo(p('2026-10-11', '2026-11-10') as any, hoy)).toBe('PROGRAMADA');
    expect(estadoEfectivo(p('2026-10-01', '2026-10-31') as any, hoy)).toBe('ACTIVA');
  });

  it('situacionDeSocio: vigente (con días), congelada, programada, vencida (con días) y sin membresía', () => {
    expect(situacionDeSocio([p('2026-10-01', '2026-10-31')] as any, hoy)).toMatchObject({ estado: 'VIGENTE', dias: 21 });
    expect(situacionDeSocio([p('2026-10-10', '2026-10-10')] as any, hoy)).toMatchObject({ estado: 'VIGENTE', dias: 0 });
    expect(situacionDeSocio([p('2026-10-01', '2026-10-31', 'CONGELADA')] as any, hoy)).toMatchObject({ estado: 'CONGELADA' });
    expect(situacionDeSocio([p('2026-10-20', '2026-11-19')] as any, hoy)).toMatchObject({ estado: 'PROGRAMADA', dias: 10 });
    expect(situacionDeSocio([p('2026-08-01', '2026-08-31'), p('2026-09-01', '2026-09-30')] as any, hoy)).toMatchObject({ estado: 'VENCIDA', dias: 10 });
    expect(situacionDeSocio([], hoy)).toEqual({ estado: 'SIN_MEMBRESIA' });
  });

  it('los periodos cancelados no cuentan: solo uno cancelado vigente = sin membresía', () => {
    expect(situacionDeSocio([p('2026-10-01', '2026-10-31', 'CANCELADA')] as any, hoy)).toEqual({ estado: 'SIN_MEMBRESIA' });
    // el cancelado no tapa a uno vencido real
    expect(situacionDeSocio([p('2026-10-01', '2026-10-31', 'CANCELADA'), p('2026-08-01', '2026-08-31')] as any, hoy)).toMatchObject({ estado: 'VENCIDA' });
  });

  it('inicioDeRenovacion: a continuación de lo pagado si aún hay vigencia; si no, hoy', () => {
    expect(inicioDeRenovacion([p('2026-10-01', '2026-10-31')] as any, hoy)).toBe('2026-11-01');
    expect(inicioDeRenovacion([p('2026-10-01', '2026-10-31'), p('2026-11-01', '2026-11-30')] as any, hoy)).toBe('2026-12-01');
    expect(inicioDeRenovacion([p('2026-09-01', '2026-09-30')] as any, hoy)).toBe(hoy);
    expect(inicioDeRenovacion([p('2026-10-01', '2026-10-31', 'CANCELADA')] as any, hoy)).toBe(hoy);
    expect(inicioDeRenovacion([], hoy)).toBe(hoy);
    expect(inicioDeRenovacion([p('2026-10-10', '2026-10-10')] as any, hoy)).toBe('2026-10-11'); // vence hoy: sigue mañana
  });
});

describe('membresías — NIP del socio', () => {
  it('4 a 6 dígitos', () => {
    for (const ok of ['1234', '123456']) expect(NIP_VALIDO.test(ok)).toBe(true);
    for (const mal of ['123', '1234567', 'abcd', '12 34', '']) expect(NIP_VALIDO.test(mal)).toBe(false);
  });

  it('el hash depende del tenant: el mismo NIP en dos negocios es distinto, y nunca es el NIP en claro', () => {
    const a = hashNip('tenant-A', '1234', 'llave');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain('1234');
    expect(hashNip('tenant-B', '1234', 'llave')).not.toBe(a);
    expect(hashNip('tenant-A', '1234', 'llave')).toBe(a);
    expect(hashNip('tenant-A', '1234', 'otra-llave')).not.toBe(a);
  });
});

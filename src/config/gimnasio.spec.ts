import { GIROS, GIRO_LABELS, isValidGiro } from './giros.config';
import { moduleAllowedForGiro, MODULE_GIRO_REQUIREMENTS } from './module-giro-requirements.config';
import { ALL_MODULES } from './all-modules.config';
import { DEFAULT_POS_CAPABILITIES, isValidPosCapability, POS_CAPABILITIES } from './pos-capabilities.config';
import { ROLES_CAJA, ROLES_CORTESIA, ROLES_DESCUENTO, ROLES_NIP, topeDescuentoPct } from './roles-pos.config';
import { contextoCobro, puedeCobrar, puedeDividir } from './politicas-pos.config';

// Bloque A del gimnasio: giro, módulo, capacidad y rol RECEPCION. Sin reservas: las canchas se reservan en Playtomic.
describe('gimnasio — giro, módulos y capacidades', () => {
  it('el giro gimnasio existe, es válido y tiene etiqueta', () => {
    expect(GIROS).toContain('gimnasio');
    expect(isValidGiro('gimnasio')).toBe(true);
    expect(GIRO_LABELS.gimnasio).toBe('Gimnasio / club deportivo');
    expect(isValidGiro('padel')).toBe(false);
  });

  it('el módulo membresias solo se activa en el giro gimnasio', () => {
    expect(MODULE_GIRO_REQUIREMENTS.membresias).toEqual(['gimnasio']);
    expect(moduleAllowedForGiro('membresias', 'gimnasio')).toBe(true);
    for (const giro of ['generico', 'restaurante', 'retail', 'medico_dental', 'medico_general']) {
      expect(moduleAllowedForGiro('membresias', giro)).toBe(false);
    }
  });

  it('un gimnasio no recibe pacientes (módulo médico) y los módulos de siempre siguen sin restricción de giro', () => {
    expect(moduleAllowedForGiro('pacientes', 'gimnasio')).toBe(false);
    for (const m of ['pos', 'configuracion_pos', 'costos', 'reportes']) expect(moduleAllowedForGiro(m, 'gimnasio')).toBe(true);
  });

  it('no existe ningún módulo ni capacidad de reservas', () => {
    expect(ALL_MODULES.filter((m) => /reserv|cancha|padel/i.test(m))).toEqual([]);
    expect(POS_CAPABILITIES.filter((c) => /reserv|cancha|padel/i.test(c))).toEqual([]);
    expect(ALL_MODULES).toContain('membresias');
  });

  it('la capacidad membresias existe y viene apagada por default', () => {
    expect(isValidPosCapability('membresias')).toBe(true);
    expect(DEFAULT_POS_CAPABILITIES.membresias).toBe(false);
    // y no cambia el default de las que ya existían
    expect(DEFAULT_POS_CAPABILITIES).toMatchObject({ venta_directa_producto: true, mesas_cuenta_abierta: false, venta_de_servicio: false });
  });
});

describe('gimnasio — rol RECEPCION', () => {
  const recepcion = { id: 'u-rec', email: 'rec@gym', roleCode: 'RECEPCION', posLiteAccess: false };
  const recepcionNip = { ...recepcion, posLiteAccess: true };

  it('entra por NIP y opera la caja del mostrador', () => {
    expect(ROLES_NIP).toContain('RECEPCION');
    expect(ROLES_CAJA).toContain('RECEPCION');
    expect(contextoCobro(recepcion)).toBe('CAJA');
    expect(puedeCobrar(recepcion, 'SOLO_CAJA')).toBe(true);
  });

  it('con sesión POS Lite (NIP) cuenta como mesa, igual que cualquier rol de NIP: no cobra con SOLO_CAJA', () => {
    expect(contextoCobro(recepcionNip)).toBe('MESA');
    expect(puedeCobrar(recepcionNip, 'SOLO_CAJA')).toBe(false);
  });

  it('no da descuentos (tope = ninguno: fuera de ROLES_DESCUENTO) ni cortesías', () => {
    expect(ROLES_DESCUENTO).not.toContain('RECEPCION');
    expect(ROLES_CORTESIA).not.toContain('RECEPCION');
    expect(topeDescuentoPct('RECEPCION')).toBe(Number.POSITIVE_INFINITY); // el tope solo se consulta DESPUÉS de estar en ROLES_DESCUENTO
  });

  it('no divide cuentas con la política por defecto (solo gerente, capitán y cajero); con TODOS sí', () => {
    expect(puedeDividir(recepcion, 'SOLO_CAJA', 'GERENTE_CAPITAN_CAJERO')).toBe(false);
    expect(puedeDividir(recepcion, 'SOLO_CAJA', 'TODOS')).toBe(true);
  });
});

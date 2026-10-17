import { MockPacProvider } from './mock-pac.provider';
import { PacError, type CfdiEntrada } from './pac.types';

const entrada = (over: Partial<CfdiEntrada> = {}): CfdiEntrada => ({
  tipo: 'I',
  moneda: 'MXN',
  lugarExpedicion: '06600',
  exportacion: '01',
  formaPago: '01',
  metodoPago: 'PUE',
  emisor: { rfc: 'EKU9003173C9', nombreFiscal: 'ESCUELA KEMPER URGATE', regimenFiscal: '601' },
  receptor: { rfc: 'XAXX010101000', nombreFiscal: 'PUBLICO EN GENERAL', codigoPostal: '06600', regimenFiscal: '616', usoCfdi: 'S01' },
  conceptos: [
    {
      claveProdServ: '90101500',
      claveUnidad: 'H87',
      descripcion: 'Consumo',
      cantidad: 1,
      valorUnitario: 10,
      importe: 10,
      objetoImp: '02',
      traslados: [{ impuesto: '002', tipoFactor: 'Tasa', tasa: 0.08, base: 10, importe: 0.8 }],
    },
  ],
  subtotal: 10,
  total: 10.8,
  ...over,
});

describe('MockPacProvider', () => {
  const FECHA = new Date('2026-10-17T12:00:00Z');
  let pac: MockPacProvider;
  beforeEach(() => {
    pac = new MockPacProvider({ ahora: () => FECHA });
  });

  it('timbra y marca el comprobante como SIN validez fiscal', async () => {
    const c = await pac.timbrar(entrada(), 'venta-1');
    expect(c.sinValidezFiscal).toBe(true);
    expect(c.xml).toContain('SIMULADO');
    expect(c.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(c.fechaTimbrado).toEqual(FECHA);
  });

  it('es determinista entre instancias e idempotente dentro de una', async () => {
    const a = await pac.timbrar(entrada(), 'venta-1');
    const b = await pac.timbrar(entrada(), 'venta-1');
    const otra = await new MockPacProvider().timbrar(entrada(), 'venta-1');
    expect(b).toBe(a);
    expect(otra.uuid).toBe(a.uuid);
    expect((await pac.timbrar(entrada(), 'venta-2')).uuid).not.toBe(a.uuid);
  });

  it('exige claveIdempotencia', async () => {
    await expect(pac.timbrar(entrada(), '')).rejects.toThrow('claveIdempotencia');
  });

  it('valida RFC, CP, conceptos y totales con errores en español', async () => {
    const malo = entrada({
      emisor: { rfc: 'MAL', nombreFiscal: 'X', regimenFiscal: '601' },
      lugarExpedicion: '66',
      subtotal: 99,
    });
    const v = await pac.validar(malo);
    expect(v.ok).toBe(false);
    expect(v.errores.map((e) => e.codigo)).toEqual(expect.arrayContaining(['RFC_EMISOR_INVALIDO', 'CP_INVALIDO', 'TOTAL_NO_CUADRA']));
    expect((await pac.validar(entrada({ conceptos: [] }))).errores[0].codigo).toBe('SIN_CONCEPTOS');
    await expect(pac.timbrar(malo, 'x')).rejects.toBeInstanceOf(PacError);
  });

  it('timeout simulado: falla sin guardar nada, y consultarPorReferencia no inventa un CFDI', async () => {
    const caido = new MockPacProvider({ fallarTimbrado: true });
    await expect(caido.timbrar(entrada(), 'venta-9')).rejects.toMatchObject({ codigo: 'SERVICIO_NO_DISPONIBLE' });
    expect(await caido.consultarPorReferencia('EKU9003173C9', 'venta-9')).toBeNull();
  });

  it('consultarPorReferencia recupera lo ya timbrado', async () => {
    const c = await pac.timbrar(entrada(), 'venta-1');
    expect(await pac.consultarPorReferencia('EKU9003173C9', 'venta-1')).toBe(c);
  });

  it('cancelación: 02 inmediata; 01 exige sustituto y queda en proceso; no se cancela dos veces', async () => {
    const a = await pac.timbrar(entrada(), 'a');
    const b = await pac.timbrar(entrada(), 'b');
    expect(await pac.cancelar(a.uuid, '02')).toEqual({ estatus: 'Cancelado', requiereAceptacion: false });
    expect(await pac.estatus(a.uuid)).toBe('Cancelado');
    await expect(pac.cancelar(a.uuid, '02')).rejects.toMatchObject({ codigo: 'YA_CANCELADO' });
    await expect(pac.cancelar(b.uuid, '01')).rejects.toMatchObject({ codigo: 'MOTIVO_INVALIDO' });
    expect(await pac.cancelar(b.uuid, '01', a.uuid)).toEqual({ estatus: 'EnProceso', requiereAceptacion: true });
    await expect(pac.cancelar('no-existe', '02')).rejects.toMatchObject({ codigo: 'UUID_NO_ENCONTRADO' });
    expect(await pac.estatus('no-existe')).toBe('NoEncontrado');
  });

  it('descarga el XML simulado', async () => {
    const c = await pac.timbrar(entrada(), 'a');
    expect((await pac.descargarXml(c.uuid)).toString()).toBe(c.xml);
    await expect(pac.descargarXml('x')).rejects.toBeInstanceOf(PacError);
  });
});

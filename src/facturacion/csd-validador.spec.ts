import { inspeccionarCsd } from './csd-validador';
import { CSD_OTRO_CER_B64, CSD_OTRO_KEY_B64, CSD_PRUEBA_CER_B64, CSD_PRUEBA_KEY_B64, CSD_PRUEBA_NUMERO, CSD_PRUEBA_PASSWORD, CSD_PRUEBA_RFC } from './__fixtures__/csd-prueba';

const base = { cerB64: CSD_PRUEBA_CER_B64, keyB64: CSD_PRUEBA_KEY_B64, password: CSD_PRUEBA_PASSWORD, rfcEmpresa: CSD_PRUEBA_RFC };

describe('inspeccionarCsd', () => {
  it('un CSD correcto devuelve número de 20 dígitos, RFC y vigencia', () => {
    const r = inspeccionarCsd(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.csd.numeroCertificado).toBe(CSD_PRUEBA_NUMERO);
    expect(r.csd.rfc).toBe(CSD_PRUEBA_RFC);
    expect(r.csd.vigenteHasta.getTime()).toBeGreaterThan(Date.now());
    expect(r.csd.cerPem).toContain('BEGIN CERTIFICATE');
    expect(JSON.stringify(r)).not.toContain(CSD_PRUEBA_PASSWORD); // la contraseña nunca sale
  });

  it('el RFC de la empresa se compara sin importar mayúsculas', () => {
    expect(inspeccionarCsd({ ...base, rfcEmpresa: CSD_PRUEBA_RFC.toLowerCase() }).ok).toBe(true);
  });

  it('rechaza un certificado de otro RFC', () => {
    const r = inspeccionarCsd({ ...base, rfcEmpresa: 'XAXX010101000' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.join(' ')).toMatch(/no es el de la empresa/);
  });

  it('rechaza una contraseña incorrecta sin revelarla', () => {
    const r = inspeccionarCsd({ ...base, password: 'mala-contraseña' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errores.join(' ')).toMatch(/contraseña no abre/);
      expect(JSON.stringify(r)).not.toContain('mala-contraseña');
    }
  });

  it('rechaza un .key que no corresponde al .cer', () => {
    const r = inspeccionarCsd({ ...base, keyB64: CSD_OTRO_KEY_B64 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.join(' ')).toMatch(/no corresponde/);
  });

  it('rechaza un certificado vencido y uno que aún no empieza', () => {
    const vencido = inspeccionarCsd({ ...base, ahora: new Date('2031-01-01') });
    expect(vencido.ok).toBe(false);
    if (!vencido.ok) expect(vencido.errores.join(' ')).toMatch(/venció/);
    const futuro = inspeccionarCsd({ ...base, ahora: new Date('2020-01-01') });
    expect(futuro.ok).toBe(false);
    if (!futuro.ok) expect(futuro.errores.join(' ')).toMatch(/todavía no es vigente/);
  });

  it('avisa (sin rechazar) si vence en menos de 30 días', () => {
    const r = inspeccionarCsd({ ...base, ahora: new Date('2030-10-01') });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.advertencias.join(' ')).toMatch(/vence pronto/);
  });

  it('archivos faltantes o que no son base64/certificado', () => {
    expect(inspeccionarCsd({ ...base, cerB64: '' }).ok).toBe(false);
    expect(inspeccionarCsd({ ...base, keyB64: undefined }).ok).toBe(false);
    expect(inspeccionarCsd({ ...base, password: '' }).ok).toBe(false);
    const raro = inspeccionarCsd({ ...base, cerB64: Buffer.from('no soy un certificado').toString('base64') });
    expect(raro.ok).toBe(false);
    if (!raro.ok) expect(raro.errores[0]).toMatch(/no es un certificado válido/);
  });

  it('la pareja de «otro» certificado sí es válida por sí sola (control del fixture)', () => {
    expect(inspeccionarCsd({ cerB64: CSD_OTRO_CER_B64, keyB64: CSD_OTRO_KEY_B64, password: CSD_PRUEBA_PASSWORD, rfcEmpresa: 'XAXX010101000' }).ok).toBe(true);
  });
});

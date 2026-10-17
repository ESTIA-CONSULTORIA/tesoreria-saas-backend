import { esClaveProdServ, esClaveUnidad, esCodigoPostal, validarRfc } from './fiscal-validators';

describe('validarRfc', () => {
  // RFC de pruebas que publica el SAT (CSD de prueba): persona moral y persona física.
  it('acepta persona moral (12) y física (13) con dígito verificador correcto', () => {
    expect(validarRfc('EKU9003173C9')).toEqual({ ok: true, rfc: 'EKU9003173C9', tipo: 'MORAL' });
    expect(validarRfc('XIQB891116QE4')).toEqual({ ok: true, rfc: 'XIQB891116QE4', tipo: 'FISICA' });
  });

  it('normaliza minúsculas y espacios', () => {
    expect(validarRfc('  eku9003173c9 ')).toMatchObject({ ok: true, rfc: 'EKU9003173C9' });
  });

  it('acepta los RFC genéricos nacional y extranjero', () => {
    expect(validarRfc('XAXX010101000')).toMatchObject({ ok: true, tipo: 'GENERICO_NACIONAL' });
    expect(validarRfc('XEXX010101000')).toMatchObject({ ok: true, tipo: 'GENERICO_EXTRANJERO' });
  });

  it('rechaza dígito verificador incorrecto', () => {
    expect(validarRfc('EKU9003173C8')).toMatchObject({ ok: false });
    expect(validarRfc('XIQB891116QE5')).toMatchObject({ ok: false });
  });

  it('rechaza fechas imposibles dentro del RFC', () => {
    expect(validarRfc('EKU9013173C9')).toMatchObject({ ok: false }); // mes 13
    expect(validarRfc('EKU9002303C9')).toMatchObject({ ok: false }); // 30 de febrero
  });

  it('rechaza formato inválido, vacío y nulos', () => {
    for (const v of ['', '   ', 'ABC', 'EKU9003173C99', '1234567890123', null, undefined]) {
      expect(validarRfc(v as any)).toMatchObject({ ok: false });
    }
  });
});

describe('claves por formato', () => {
  it('código postal: exactamente 5 dígitos', () => {
    expect(esCodigoPostal('06600')).toBe(true);
    for (const v of ['6600', '066000', '0660A', '', null, 6600]) expect(esCodigoPostal(v)).toBe(false);
  });
  it('c_ClaveProdServ: 8 dígitos', () => {
    expect(esClaveProdServ('90101500')).toBe(true);
    for (const v of ['9010150', '901015000', '9010150A', null]) expect(esClaveProdServ(v)).toBe(false);
  });
  it('c_ClaveUnidad: 2 o 3 caracteres alfanuméricos en mayúscula', () => {
    expect(esClaveUnidad('H87')).toBe(true);
    expect(esClaveUnidad('E48')).toBe(true);
    for (const v of ['h87', 'H', 'H877', 'H 7', null]) expect(esClaveUnidad(v)).toBe(false);
  });
});

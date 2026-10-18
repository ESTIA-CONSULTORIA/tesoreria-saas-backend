import { MASCARA, redactar, redactarUrl } from './redactar';

describe('bitácora: los secretos no se guardan', () => {
  it('enmascara contraseñas y NIP del login y del alta de usuarios', () => {
    expect(redactar({ email: 'a@b.com', password: 'Admin123' })).toEqual({ email: 'a@b.com', password: MASCARA });
    expect(redactar({ nip: '4321', executivePin: '9999', name: 'Ana' })).toEqual({ nip: MASCARA, executivePin: MASCARA, name: 'Ana' });
    expect(redactar({ newPassword: 'x', currentPassword: 'y', confirmPassword: 'z' })).toEqual({ newPassword: MASCARA, currentPassword: MASCARA, confirmPassword: MASCARA });
  });

  it('enmascara el CSD (.key, .cer, contraseña) y las credenciales de integraciones', () => {
    const r: any = redactar({ cerB64: 'AAA', keyB64: 'BBB', password: 'p', apiKey: 'k', secretoCifrado: 's', token: 't', credentials: { usuario: 'u' } });
    for (const campo of ['cerB64', 'keyB64', 'password', 'apiKey', 'secretoCifrado', 'token', 'credentials']) expect(r[campo]).toBe(MASCARA);
  });

  it('actúa a cualquier profundidad y dentro de arreglos', () => {
    const r: any = redactar({ usuarios: [{ email: 'a', password: 'p1' }, { email: 'b', pin: '1234' }], datos: { anidado: { clave: 'x', ok: 1 } } });
    expect(r.usuarios[0].password).toBe(MASCARA);
    expect(r.usuarios[1].pin).toBe(MASCARA);
    expect(r.datos.anidado).toEqual({ clave: MASCARA, ok: 1 });
  });

  it('no toca campos normales, incluidas las claves SAT del catálogo fiscal', () => {
    const cuerpo = { claveProdServ: '90101501', claveUnidad: 'E48', rfc: 'EKU9003173C9', nombre: 'Agua', precio: 20, folio: 'VTA-1' };
    expect(redactar(cuerpo)).toEqual(cuerpo);
  });

  it('no muta el original ni rompe con null, números o cadenas', () => {
    const original = { password: 'x', a: { pin: '1' } };
    redactar(original);
    expect(original).toEqual({ password: 'x', a: { pin: '1' } });
    expect(redactar(null)).toBeNull();
    expect(redactar(5)).toBe(5);
    expect(redactar('texto')).toBe('texto');
    expect(redactar(undefined)).toBeUndefined();
  });

  it('enmascara secretos en la URL', () => {
    expect(redactarUrl('/pos/x?token=abc&page=2')).toBe(`/pos/x?token=${MASCARA}&page=2`);
    expect(redactarUrl('/users?nip=1234')).toBe(`/users?nip=${MASCARA}`);
    expect(redactarUrl('/users?page=1')).toBe('/users?page=1');
  });
});

import { cifrarSecreto, descifrarSecreto, estaCifradoConLlaveVigente, idLlave } from './csd-crypto';

const LLAVE_A = 'a'.repeat(32) + '-llave-A';
const LLAVE_B = 'b'.repeat(32) + '-llave-B';

describe('CSD — cifrado AES-256-GCM versionado', () => {
  const original = { k: process.env.ENCRYPTION_KEY, p: process.env.ENCRYPTION_KEY_PREVIOUS };
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = LLAVE_A;
    delete process.env.ENCRYPTION_KEY_PREVIOUS;
  });
  afterAll(() => {
    if (original.k === undefined) delete process.env.ENCRYPTION_KEY; else process.env.ENCRYPTION_KEY = original.k;
    if (original.p === undefined) delete process.env.ENCRYPTION_KEY_PREVIOUS; else process.env.ENCRYPTION_KEY_PREVIOUS = original.p;
  });

  it('ida y vuelta, con formato v2:gcm:<keyId>:<iv>:<tag>:<texto> y sin el texto en claro', () => {
    const c = cifrarSecreto('contraseña-del-csd', 'T|C|password');
    expect(c.startsWith(`v2:gcm:${idLlave(LLAVE_A)}:`)).toBe(true);
    expect(c.split(':')).toHaveLength(6);
    expect(c).not.toContain('contraseña');
    expect(descifrarSecreto(c, 'T|C|password')).toBe('contraseña-del-csd');
  });

  it('IV aleatorio: el mismo texto da cifrados distintos', () => {
    expect(cifrarSecreto('x', 'ctx')).not.toBe(cifrarSecreto('x', 'ctx'));
  });

  it('el contexto va autenticado: copiar el valor a otro tenant/empresa/campo NO descifra', () => {
    const c = cifrarSecreto('secreto', 'tenant-A|co-A|key');
    expect(() => descifrarSecreto(c, 'tenant-B|co-A|key')).toThrow(/No se pudo descifrar/);
    expect(() => descifrarSecreto(c, 'tenant-A|co-A|password')).toThrow(/No se pudo descifrar/);
  });

  it('detecta alteración (autenticado)', () => {
    const c = cifrarSecreto('secreto', 'ctx');
    const partes = c.split(':');
    partes[5] = (partes[5][0] === 'a' ? 'b' : 'a') + partes[5].slice(1);
    expect(() => descifrarSecreto(partes.join(':'), 'ctx')).toThrow(/No se pudo descifrar/);
  });

  it('sin ENCRYPTION_KEY (o corta) no se guarda ni se usa un CSD, con error claro', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => cifrarSecreto('x', 'ctx')).toThrow(/ENCRYPTION_KEY/);
    process.env.ENCRYPTION_KEY = 'corta';
    expect(() => cifrarSecreto('x', 'ctx')).toThrow(/ENCRYPTION_KEY/);
    expect(() => descifrarSecreto('v2:gcm:00000000:aa:bb:cc', 'ctx')).toThrow(/ENCRYPTION_KEY/);
  });

  it('rotación: lo cifrado con la llave anterior sigue abriendo mientras esté en ENCRYPTION_KEY_PREVIOUS', () => {
    const viejo = cifrarSecreto('secreto', 'ctx'); // con A
    process.env.ENCRYPTION_KEY = LLAVE_B;
    expect(() => descifrarSecreto(viejo, 'ctx')).toThrow(/ya no está configurada/); // B sola no basta
    process.env.ENCRYPTION_KEY_PREVIOUS = LLAVE_A;
    expect(descifrarSecreto(viejo, 'ctx')).toBe('secreto');
    expect(estaCifradoConLlaveVigente(viejo)).toBe(false); // hay que re-cifrar
    const nuevo = cifrarSecreto(descifrarSecreto(viejo, 'ctx'), 'ctx');
    expect(estaCifradoConLlaveVigente(nuevo)).toBe(true);
    delete process.env.ENCRYPTION_KEY_PREVIOUS;
    expect(descifrarSecreto(nuevo, 'ctx')).toBe('secreto');
  });

  it('rechaza valores que no son v2', () => {
    expect(() => descifrarSecreto('abcd:ef01', 'ctx')).toThrow(/formato/);
    expect(() => descifrarSecreto('v2:gcm:00000000', 'ctx')).toThrow(/incompleto/);
  });
});

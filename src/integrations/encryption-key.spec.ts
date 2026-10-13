import { InternalServerErrorException } from '@nestjs/common';
import { decrypt, encrypt, getEncryptionKey, IntegrationsService } from './integrations.service';

// C3 (ESTADO-SISTEMA): la llave de cifrado de credenciales sale solo del entorno; sin ella (o corta) falla al cifrar,
// no al arrancar, y nunca se cae a una constante del repositorio.
const LLAVE_OK = 'k'.repeat(32) + '-llave-de-prueba';

describe('ENCRYPTION_KEY obligatoria', () => {
  const original = process.env.ENCRYPTION_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = original;
  });

  it('importar el módulo sin la variable no lanza (no tumba el arranque)', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => jest.isolateModules(() => require('./integrations.service'))).not.toThrow();
  });

  it('falta la variable: cifrar falla con un error claro', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt('{"rfc":"X"}')).toThrow(InternalServerErrorException);
    expect(() => encrypt('{"rfc":"X"}')).toThrow(/ENCRYPTION_KEY/);
  });

  it('variable vacía: falla igual', () => {
    process.env.ENCRYPTION_KEY = '';
    expect(() => encrypt('x')).toThrow(/ENCRYPTION_KEY/);
  });

  it('menos de 32 caracteres: falla con un error claro', () => {
    process.env.ENCRYPTION_KEY = 'corta-31-caracteres-aaaaaaaaaaa'.slice(0, 31);
    expect(process.env.ENCRYPTION_KEY).toHaveLength(31);
    expect(() => encrypt('x')).toThrow(InternalServerErrorException);
    expect(() => encrypt('x')).toThrow(/32 caracteres/);
  });

  it('el error nunca incluye la constante vieja ni el valor de la variable', () => {
    process.env.ENCRYPTION_KEY = 'secreta-corta';
    try {
      encrypt('x');
      fail('debía lanzar');
    } catch (e: any) {
      expect(String(e.message)).not.toContain('secreta-corta');
      expect(String(e.message)).not.toContain('estia_key_2024');
    }
  });

  it('con 32+ caracteres cifra y descifra; la constante vieja ya no sirve de llave', () => {
    process.env.ENCRYPTION_KEY = LLAVE_OK;
    const cifrado = encrypt('{"secret":"abc"}');
    expect(cifrado).toMatch(/^[0-9a-f]{32}:[0-9a-f]+$/);
    expect(decrypt(cifrado)).toBe('{"secret":"abc"}');
    // con otra llave no se recupera el texto
    process.env.ENCRYPTION_KEY = 'estia_key_2024_32bytes_padding!!';
    expect(decrypt(cifrado)).toBe('');
  });

  it('exactamente 32 caracteres es válido', () => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(32);
    expect(getEncryptionKey()).toHaveLength(32);
  });

  it('decrypt sin llave falla con el error claro (no devuelve "" en silencio)', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => decrypt('aa:bb')).toThrow(/ENCRYPTION_KEY/);
  });

  it('activate() sin llave falla con 500 claro y no guarda nada', async () => {
    delete process.env.ENCRYPTION_KEY;
    const repo: any = { findOne: jest.fn(), create: jest.fn(), save: jest.fn(), update: jest.fn() };
    const svc = new IntegrationsService(repo);
    await expect(svc.activate('t1', 'bbva', { cliente_id: 'a', secret: 'b', cuenta: 'c' })).rejects.toThrow(InternalServerErrorException);
    expect(repo.save).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });
});

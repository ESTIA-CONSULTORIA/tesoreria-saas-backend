import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { assertPinEjecutivoValido, errorPinEjecutivo, pinEjecutivoEnUso } from './executive-pin.util';

describe('errorPinEjecutivo', () => {
  it.each(['123456', '000000', '12345678', '123456789012'])('acepta %s', (pin) => {
    expect(errorPinEjecutivo(pin)).toBeNull();
  });
  it.each(['1234', '12345', '1234567890123', '12a456', '12 456', '', undefined, null, 123456])('rechaza %j', (pin) => {
    expect(errorPinEjecutivo(pin as any)).toMatch(/entre 6 y 12 dígitos/);
  });
});

describe('pinEjecutivoEnUso / assertPinEjecutivoValido', () => {
  let usuarios: Array<{ id: string; executivePin: string | null }>;
  beforeAll(async () => {
    usuarios = [
      { id: 'a', executivePin: await bcrypt.hash('482913', 4) },
      { id: 'b', executivePin: await bcrypt.hash('735120', 4) },
      { id: 'c', executivePin: null },
    ];
  });

  it('detecta el PIN de otro usuario, ignora al propio y a quien no tiene PIN', async () => {
    expect(await pinEjecutivoEnUso(usuarios, '482913')).toBe(true);
    expect(await pinEjecutivoEnUso(usuarios, '482913', 'a')).toBe(false);
    expect(await pinEjecutivoEnUso(usuarios, '999999')).toBe(false);
  });
  it('rechaza formato inválido antes de comparar', async () => {
    await expect(assertPinEjecutivoValido('1234', usuarios)).rejects.toThrow(/entre 6 y 12/);
  });
  it('rechaza PIN repetido en el tenant con 400', async () => {
    await expect(assertPinEjecutivoValido('735120', usuarios, 'a')).rejects.toThrow(BadRequestException);
    await expect(assertPinEjecutivoValido('735120', usuarios, 'a')).rejects.toThrow(/ya lo usa otro usuario/);
  });
  it('sin tenant solo valida el formato', async () => {
    await expect(assertPinEjecutivoValido('482913', null)).resolves.toBeUndefined();
  });
});

describe('UsersService: PIN ejecutivo al crear y editar', () => {
  const hashA = bcrypt.hashSync('482913', 4);
  function servicio(existente: any = { id: 'u1', tenantId: 'T', roleCode: 'ADMIN' }) {
    const qb: any = { addSelect: () => qb, where: () => qb, getMany: async () => [{ id: 'otro', executivePin: hashA }, { id: 'u1', executivePin: null }] };
    const repo: any = {
      createQueryBuilder: () => qb,
      findOne: jest.fn(async () => existente),
      update: jest.fn(async () => undefined),
      create: jest.fn((x: any) => x),
      save: jest.fn(async (x: any) => x),
      count: jest.fn(async () => 0),
      find: jest.fn(async () => []),
    };
    const tenantRepo: any = { findOne: jest.fn(async () => ({ plan: 'PRO' })) };
    return { svc: new UsersService(repo, tenantRepo), repo };
  }

  it('create: rechaza PIN de 4 dígitos', async () => {
    const { svc, repo } = servicio();
    await expect(svc.create('x@x.com', 'Clave-Larga-1', 'X', undefined, 'ADMIN', 'T', undefined, undefined, '1234')).rejects.toThrow(/entre 6 y 12/);
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('create: rechaza PIN que ya usa otro usuario del tenant', async () => {
    const { svc, repo } = servicio();
    await expect(svc.create('x@x.com', 'Clave-Larga-1', 'X', undefined, 'ADMIN', 'T', undefined, undefined, '482913')).rejects.toThrow(/ya lo usa/);
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('create: acepta un PIN válido y guarda solo el hash', async () => {
    const { svc, repo } = servicio();
    await svc.create('x@x.com', 'Clave-Larga-1', 'X', undefined, 'ADMIN', 'T', undefined, undefined, '902817');
    const guardado = repo.save.mock.calls[0][0];
    expect(guardado.executivePin).not.toBe('902817');
    expect(await bcrypt.compare('902817', guardado.executivePin)).toBe(true);
  });
  it('update: rechaza repetido o corto, y no valida si no se manda PIN', async () => {
    const { svc, repo } = servicio();
    await expect(svc.update('u1', { executivePin: '482913' })).rejects.toThrow(/ya lo usa/);
    await expect(svc.update('u1', { executivePin: '123' })).rejects.toThrow(/entre 6 y 12/);
    expect(repo.update).not.toHaveBeenCalled();
    await svc.update('u1', { name: 'Solo nombre' });
    expect(repo.update).toHaveBeenCalledTimes(1);
    await svc.update('u1', { executivePin: '556677' });
    expect(repo.update).toHaveBeenCalledTimes(2);
  });
});

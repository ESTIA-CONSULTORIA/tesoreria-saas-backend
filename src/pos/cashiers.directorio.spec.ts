import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { CashiersService } from './cashiers.service';
import { User } from '../users/entities/user.entity';
import { Tenant } from '../tenants/entities/tenant.entity';

// Directorio de nombres para mostrar al cajero por nombre: solo del tenant del token, solo id/nombre/correo.
const USERS = [
  { id: 'u1', tenantId: 'A', name: 'Ana Pérez', email: 'ana@a.mx', password: 'HASH', executivePin: '1234' },
  { id: 'u2', tenantId: 'A', name: '  ', email: 'sin-nombre@a.mx' },
  { id: 'u3', tenantId: 'A', name: null, email: 'nulo@a.mx' },
  { id: 'u4', tenantId: 'B', name: 'Beto de B', email: 'beto@b.mx' },
];

describe('CashiersService.directorio', () => {
  let service: CashiersService;
  let find: jest.Mock;

  beforeEach(async () => {
    find = jest.fn(({ where, select }: any) =>
      Promise.resolve(USERS.filter((u) => u.tenantId === where.tenantId).map((u: any) => Object.fromEntries(select.map((k: string) => [k, u[k]])))),
    );
    const m = await Test.createTestingModule({
      providers: [
        CashiersService,
        { provide: getRepositoryToken(User), useValue: { find } },
        { provide: getRepositoryToken(Tenant), useValue: {} },
        { provide: JwtService, useValue: {} },
      ],
    }).compile();
    service = m.get(CashiersService);
  });

  it('devuelve solo los usuarios del tenant, con nombre o null si no tiene', async () => {
    const r = await service.directorio('A');
    expect(r.map((x) => x.id)).toEqual(['u1', 'u2', 'u3']);
    expect(r[0]).toEqual({ id: 'u1', nombre: 'Ana Pérez', email: 'ana@a.mx' });
    expect(r[1].nombre).toBeNull();
    expect(r[2].nombre).toBeNull();
  });

  it('aislamiento: el tenant B no ve a los de A y viceversa', async () => {
    expect((await service.directorio('B')).map((x) => x.id)).toEqual(['u4']);
    expect((await service.directorio('A')).some((x) => x.id === 'u4')).toBe(false);
  });

  it('nunca expone hash ni PIN: solo pide id, name y email', async () => {
    await service.directorio('A');
    expect(find.mock.calls[0][0].select).toEqual(['id', 'name', 'email']);
  });

  it('sin tenant devuelve vacío y no consulta', async () => {
    expect(await service.directorio(undefined)).toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });
});

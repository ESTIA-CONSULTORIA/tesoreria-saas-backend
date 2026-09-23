import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { Tenant } from '../tenants/entities/tenant.entity';

// Auditoría BUSINESS (hallazgo transversal #8 / recomendación #0): GET /users/email/:email
// era @Public() y devolvía el resultado crudo de UsersService.findByEmail(), que
// deliberadamente vuelve a incluir el hash de password (vía .addSelect(['user.password']))
// porque auth.service.ts lo necesita para bcrypt.compare() en el login/register/portal-login.
//
// Corrección de diagnóstico respecto a la redacción original del hallazgo: NO era que la
// entidad User le faltara `select: false` en `password` — ya lo tiene desde el commit
// 3e5ce4c (2026-06-21), meses antes de esta auditoría. El problema real es que este endpoint
// público reexponía sin querer el resultado de una consulta interna pensada solo para el
// flujo de autenticación. Sin ningún consumidor real (grep limpio en frontend-core y
// deliveryhub-pro), se elimina el endpoint del controller; UsersService.findByEmail() se deja
// intacto porque auth.service.ts sí lo necesita para login.
describe('UsersController — GET /users/email/:email eliminado (hallazgo #0)', () => {
  it('ya no expone una ruta pública que devuelva el hash de password de cualquier cuenta', () => {
    expect((UsersController.prototype as any).findByEmail).toBeUndefined();
  });
});

describe('UsersService.findByEmail() — se mantiene intacto para el flujo interno de login', () => {
  let service: UsersService;
  let usersRepo: { createQueryBuilder: jest.Mock };

  beforeEach(async () => {
    const qb = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        password: '$2b$10$hashedvalue',
      }),
    };
    usersRepo = { createQueryBuilder: jest.fn(() => qb) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: getRepositoryToken(Tenant), useValue: { findOne: jest.fn() } },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('sigue trayendo el hash de password — auth.service.ts lo necesita para bcrypt.compare()', async () => {
    const result: any = await service.findByEmail('a@b.com');
    expect(result.password).toBeDefined();
    expect(usersRepo.createQueryBuilder().addSelect).toHaveBeenCalledWith(['user.password']);
  });
});

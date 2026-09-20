import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantSettingsController } from './tenant-settings.controller';
import { TenantSettingsService } from './tenant-settings.service';
import { ROLES_KEY } from '../auth/roles.decorator';

// Auditoría BUSINESS (hallazgo #3, recomendación #3): PUT/POST /tenant-settings/:tenantId no
// tenían NINGÚN guard — cualquier usuario autenticado de cualquier tenant, incluso un CAJERO,
// podía sobrescribir el branding y el stockPolicy de OTRO tenant con solo conocer su UUID.
// GET /tenant-settings/:tenantId sigue @Public() a propósito (ver comentario en el
// controller) — no se toca, no forma parte de este hallazgo.
describe('TenantSettingsController — aislamiento por tenant + rol mínimo', () => {
  let controller: TenantSettingsController;
  let service: { upsert: jest.Mock; findByTenant: jest.Mock; getDefaults: jest.Mock };
  const reflector = new Reflector();

  const TENANT_A = 'tenant-A';
  const TENANT_B = 'tenant-B';

  beforeEach(async () => {
    service = {
      upsert: jest.fn().mockResolvedValue({ tenantId: TENANT_B }),
      findByTenant: jest.fn(),
      getDefaults: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantSettingsController],
      providers: [{ provide: TenantSettingsService, useValue: service }],
    }).compile();
    controller = module.get<TenantSettingsController>(TenantSettingsController);
  });

  describe('PUT :tenantId (update)', () => {
    it('rechaza sobrescribir la configuración de OTRO tenant', () => {
      expect(() =>
        controller.update(
          TENANT_B,
          { primaryColor: '#000' },
          { user: { tenantId: TENANT_A, roleCode: 'ADMIN' } } as any,
        ),
      ).toThrow(ForbiddenException);
      expect(service.upsert).not.toHaveBeenCalled();
    });

    it('permite a un ADMIN sobrescribir la configuración del MISMO tenant', () => {
      controller.update(
        TENANT_B,
        { primaryColor: '#000' },
        { user: { tenantId: TENANT_B, roleCode: 'ADMIN' } } as any,
      );
      expect(service.upsert).toHaveBeenCalledWith(TENANT_B, { primaryColor: '#000' });
    });

    it('permite a SOPORTE (sin tenantId propio en su JWT) sobrescribir cualquier tenant', () => {
      controller.update(
        TENANT_B,
        { primaryColor: '#000' },
        { user: { tenantId: undefined, roleCode: 'SOPORTE' } } as any,
      );
      expect(service.upsert).toHaveBeenCalledWith(TENANT_B, { primaryColor: '#000' });
    });

    it('exige rol ADMIN o SOPORTE vía @Roles() — antes cualquier rol autenticado podía escribir', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, TenantSettingsController.prototype.update);
      expect(roles).toEqual(['ADMIN', 'SOPORTE']);
    });
  });

  describe('POST :tenantId (upsert) — mismo hueco que PUT, mismo service.upsert()', () => {
    it('rechaza sobrescribir la configuración de OTRO tenant', () => {
      expect(() =>
        controller.upsert(
          TENANT_B,
          { primaryColor: '#000' } as any,
          { user: { tenantId: TENANT_A, roleCode: 'ADMIN' } } as any,
        ),
      ).toThrow(ForbiddenException);
      expect(service.upsert).not.toHaveBeenCalled();
    });

    it('permite a un ADMIN sobrescribir la configuración del MISMO tenant', () => {
      controller.upsert(
        TENANT_B,
        { primaryColor: '#000' } as any,
        { user: { tenantId: TENANT_B, roleCode: 'ADMIN' } } as any,
      );
      expect(service.upsert).toHaveBeenCalledWith(TENANT_B, { primaryColor: '#000' });
    });

    it('exige rol ADMIN o SOPORTE vía @Roles()', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, TenantSettingsController.prototype.upsert);
      expect(roles).toEqual(['ADMIN', 'SOPORTE']);
    });
  });
});

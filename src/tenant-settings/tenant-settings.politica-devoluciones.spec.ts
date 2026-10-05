import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TenantSettingsService } from './tenant-settings.service';
import { TenantSettingsController } from './tenant-settings.controller';
import { TenantSetting } from './entities/tenant-setting.entity';
import { ROLES_KEY } from '../auth/roles.decorator';

// Política de devoluciones por tenant: default SOLO_GERENTE sin backfill, se guarda en el JSON
// posCapabilities (sin migración), solo valores válidos, aislada por tenant y solo editable/legible
// por ADMIN (la regla de rol vive en el decorador @Roles del controller).
describe('politicaDevoluciones — TenantSettingsService + controller', () => {
  let service: TenantSettingsService;
  let controller: TenantSettingsController;
  let repo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock; update: jest.Mock };
  const filas: Record<string, any> = {};

  const TENANT_A = 'tenant-A';
  const TENANT_B = 'tenant-B';

  beforeEach(async () => {
    for (const k of Object.keys(filas)) delete filas[k];
    repo = {
      findOne: jest.fn(({ where }: any) => Promise.resolve(filas[where.tenantId] ? { ...filas[where.tenantId] } : null)),
      create: jest.fn((data) => data),
      save: jest.fn((data) => { filas[data.tenantId] = { id: `s-${data.tenantId}`, ...data }; return Promise.resolve(filas[data.tenantId]); }),
      update: jest.fn((id: string, patch: any) => {
        const key = Object.keys(filas).find((k) => filas[k].id === id)!;
        filas[key] = { ...filas[key], ...patch };
        return Promise.resolve(undefined);
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantSettingsController],
      providers: [TenantSettingsService, { provide: getRepositoryToken(TenantSetting), useValue: repo }],
    }).compile();
    service = module.get(TenantSettingsService);
    controller = module.get(TenantSettingsController);
  });

  describe('default y lectura', () => {
    it('tenant sin fila de settings: SOLO_GERENTE', async () => {
      await expect(service.getPoliticaDevoluciones(TENANT_A)).resolves.toBe('SOLO_GERENTE');
    });

    it('fila existente sin la clave (todos los tenants de hoy): SOLO_GERENTE, sin backfill', async () => {
      filas[TENANT_A] = { id: 's-A', tenantId: TENANT_A, posCapabilities: { venta_directa_producto: true } };
      await expect(service.getPoliticaDevoluciones(TENANT_A)).resolves.toBe('SOLO_GERENTE');
      filas[TENANT_B] = { id: 's-B', tenantId: TENANT_B, posCapabilities: null };
      await expect(service.getPoliticaDevoluciones(TENANT_B)).resolves.toBe('SOLO_GERENTE');
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('un valor raro guardado en la fila cae al más restrictivo', async () => {
      filas[TENANT_A] = { id: 's-A', tenantId: TENANT_A, posCapabilities: { politicaDevoluciones: 'TODOS' } };
      await expect(service.getPoliticaDevoluciones(TENANT_A)).resolves.toBe('SOLO_GERENTE');
    });
  });

  describe('escritura', () => {
    it('cambia a CAJERO_LIBRE y vuelve a SOLO_GERENTE', async () => {
      await service.upsert(TENANT_A, { politicaDevoluciones: 'CAJERO_LIBRE' });
      await expect(service.getPoliticaDevoluciones(TENANT_A)).resolves.toBe('CAJERO_LIBRE');
      await service.upsert(TENANT_A, { politicaDevoluciones: 'SOLO_GERENTE' });
      await expect(service.getPoliticaDevoluciones(TENANT_A)).resolves.toBe('SOLO_GERENTE');
    });

    it('valor inválido: 400 y no se escribe nada (campo propio o dentro de posCapabilities)', async () => {
      await expect(service.upsert(TENANT_A, { politicaDevoluciones: 'TODOS' })).rejects.toThrow(BadRequestException);
      await expect(service.upsert(TENANT_A, { posCapabilities: { politicaDevoluciones: 'x' } as any })).rejects.toThrow(BadRequestException);
      await expect(service.upsert(TENANT_A, { politicaDevoluciones: '' })).rejects.toThrow(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('vive en el JSON posCapabilities (sin columna nueva) y no pisa las capacidades existentes', async () => {
      filas[TENANT_A] = { id: 's-A', tenantId: TENANT_A, posCapabilities: { mesas_cuenta_abierta: true } };
      await service.upsert(TENANT_A, { politicaDevoluciones: 'CAJERO_LIBRE' });
      expect(filas[TENANT_A].posCapabilities).toEqual({ mesas_cuenta_abierta: true, politicaDevoluciones: 'CAJERO_LIBRE' });
      // el payload del UPDATE no lleva `politicaDevoluciones` como columna (TypeORM fallaría)
      expect(repo.update.mock.calls[0][1]).not.toHaveProperty('politicaDevoluciones');
    });

    it('activar una capacidad después no borra la política', async () => {
      await service.upsert(TENANT_A, { politicaDevoluciones: 'CAJERO_LIBRE' });
      await service.upsert(TENANT_A, { posCapabilities: { mesas_cuenta_abierta: true } });
      await expect(service.getPoliticaDevoluciones(TENANT_A)).resolves.toBe('CAJERO_LIBRE');
      await expect(service.hasPosCapability(TENANT_A, 'mesas_cuenta_abierta')).resolves.toBe(true);
    });

    it('aislamiento: cambiar la política de A no toca la de B', async () => {
      await service.upsert(TENANT_A, { politicaDevoluciones: 'CAJERO_LIBRE' });
      await expect(service.getPoliticaDevoluciones(TENANT_B)).resolves.toBe('SOLO_GERENTE');
      await service.upsert(TENANT_B, { politicaDevoluciones: 'SOLO_GERENTE' });
      await expect(service.getPoliticaDevoluciones(TENANT_A)).resolves.toBe('CAJERO_LIBRE');
    });
  });

  describe('endpoint de configuración (controller)', () => {
    const admin = (tenantId: string) => ({ user: { tenantId, roleCode: 'ADMIN' } });

    it('leer y cambiar exigen ADMIN (o SOPORTE): el rol lo aplica RolesGuard con este metadato', () => {
      const get = Reflect.getMetadata(ROLES_KEY, TenantSettingsController.prototype.getPoliticaDevoluciones);
      const put = Reflect.getMetadata(ROLES_KEY, TenantSettingsController.prototype.setPoliticaDevoluciones);
      expect(get).toEqual(['ADMIN', 'SOPORTE']);
      expect(put).toEqual(['ADMIN', 'SOPORTE']);
      expect(get).not.toContain('GERENTE');
      expect(get).not.toContain('CAJERO');
    });

    it('un ADMIN lee y cambia la política de SU tenant', async () => {
      await expect(controller.getPoliticaDevoluciones(TENANT_A, admin(TENANT_A))).resolves.toEqual({ politicaDevoluciones: 'SOLO_GERENTE' });
      await expect(controller.setPoliticaDevoluciones(TENANT_A, { politicaDevoluciones: 'CAJERO_LIBRE' }, admin(TENANT_A))).resolves.toEqual({ politicaDevoluciones: 'CAJERO_LIBRE' });
    });

    it('un ADMIN de otro tenant: 403 al leer y al cambiar, sin escribir', async () => {
      await expect(controller.getPoliticaDevoluciones(TENANT_A, admin(TENANT_B))).rejects.toThrow(ForbiddenException);
      await expect(controller.setPoliticaDevoluciones(TENANT_A, { politicaDevoluciones: 'CAJERO_LIBRE' }, admin(TENANT_B))).rejects.toThrow(ForbiddenException);
      expect(repo.save).not.toHaveBeenCalled();
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('valor inválido o ausente: 400', async () => {
      await expect(controller.setPoliticaDevoluciones(TENANT_A, { politicaDevoluciones: 'NADIE' }, admin(TENANT_A))).rejects.toThrow(BadRequestException);
      await expect(controller.setPoliticaDevoluciones(TENANT_A, {}, admin(TENANT_A))).rejects.toThrow(BadRequestException);
      await expect(controller.setPoliticaDevoluciones(TENANT_A, undefined as any, admin(TENANT_A))).rejects.toThrow(BadRequestException);
    });

    it('el GET público de settings NO expone la política', async () => {
      filas[TENANT_A] = { id: 's-A', tenantId: TENANT_A, name: 'X', posCapabilities: { mesas_cuenta_abierta: true, politicaDevoluciones: 'CAJERO_LIBRE' } };
      const pub: any = await controller.findByTenant(TENANT_A);
      expect(pub.posCapabilities).toEqual({ mesas_cuenta_abierta: true });
    });
  });
});

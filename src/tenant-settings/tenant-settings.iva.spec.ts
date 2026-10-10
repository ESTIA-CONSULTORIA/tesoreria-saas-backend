import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { TenantSettingsService } from './tenant-settings.service';
import { TenantSettingsController } from './tenant-settings.controller';
import { TenantSetting } from './entities/tenant-setting.entity';
import { ROLES_KEY } from '../auth/roles.decorator';
import { calcularTotalesIva } from '../config/iva.config';

// IVA del negocio: default 16 % sin IVA incluido para todo tenant existente (sin backfill), se guarda en el JSON
// posCapabilities (sin migración), solo valores válidos, aislado por tenant y solo editable por ADMIN/SOPORTE.
describe('IVA del negocio — TenantSettingsService + controller', () => {
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
    it('tenant sin fila de settings: 16 % y precios SIN IVA incluido', async () => {
      await expect(service.getIvaConfig(TENANT_A)).resolves.toEqual({ ivaTasaDefault: '16', preciosIncluyenIva: false });
    });

    it('fila existente sin las claves (todos los tenants de hoy): igual, sin backfill ni escritura', async () => {
      filas[TENANT_A] = { id: 's-A', tenantId: TENANT_A, posCapabilities: { venta_directa_producto: true, politicaCobro: 'SOLO_CAJA' } };
      filas[TENANT_B] = { id: 's-B', tenantId: TENANT_B, posCapabilities: null };
      await expect(service.getIvaConfig(TENANT_A)).resolves.toEqual({ ivaTasaDefault: '16', preciosIncluyenIva: false });
      await expect(service.getIvaConfig(TENANT_B)).resolves.toEqual({ ivaTasaDefault: '16', preciosIncluyenIva: false });
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('un valor raro guardado en la fila cae al default (nadie queda sin IVA por un dato corrupto)', async () => {
      filas[TENANT_A] = { id: 's-A', tenantId: TENANT_A, posCapabilities: { ivaTasaDefault: '21', preciosIncluyenIva: 'si' } };
      await expect(service.getIvaConfig(TENANT_A)).resolves.toEqual({ ivaTasaDefault: '16', preciosIncluyenIva: false });
    });
  });

  describe('escritura', () => {
    it.each(['16', '8', '0', 'EXENTO'])('guarda la tasa %s', async (tasa) => {
      await service.upsert(TENANT_A, { ivaTasaDefault: tasa });
      await expect(service.getIvaConfig(TENANT_A)).resolves.toMatchObject({ ivaTasaDefault: tasa });
    });

    it('guarda preciosIncluyenIva sin pisar la tasa, las capacidades ni las políticas ya guardadas', async () => {
      filas[TENANT_A] = { id: 's-A', tenantId: TENANT_A, posCapabilities: { mesas_cuenta_abierta: true, politicaCobro: 'GERENTE_EN_MESA', ivaTasaDefault: '8' } };
      await service.upsert(TENANT_A, { preciosIncluyenIva: true });
      expect(filas[TENANT_A].posCapabilities).toEqual({ mesas_cuenta_abierta: true, politicaCobro: 'GERENTE_EN_MESA', ivaTasaDefault: '8', preciosIncluyenIva: true });
    });

    it('valor inválido: 400 y no se escribe nada (campo propio o dentro de posCapabilities)', async () => {
      await expect(service.upsert(TENANT_A, { ivaTasaDefault: '21' })).rejects.toThrow(BadRequestException);
      await expect(service.upsert(TENANT_A, { ivaTasaDefault: 16 as any })).rejects.toThrow(BadRequestException);
      await expect(service.upsert(TENANT_A, { posCapabilities: { ivaTasaDefault: 'x' } as any })).rejects.toThrow(BadRequestException);
      await expect(service.upsert(TENANT_A, { preciosIncluyenIva: 'si' as any })).rejects.toThrow(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('aislamiento de tenant: cambiar el IVA de A no cambia el de B', async () => {
      await service.upsert(TENANT_A, { ivaTasaDefault: '0', preciosIncluyenIva: true });
      await expect(service.getIvaConfig(TENANT_B)).resolves.toEqual({ ivaTasaDefault: '16', preciosIncluyenIva: false });
      await expect(service.getIvaConfig(TENANT_A)).resolves.toEqual({ ivaTasaDefault: '0', preciosIncluyenIva: true });
    });
  });

  describe('lectura pública y permisos', () => {
    it('el GET público de settings expone el IVA (el POS lo necesita para mostrarlo) pero no las políticas', async () => {
      filas[TENANT_A] = { id: 's-A', tenantId: TENANT_A, posCapabilities: { ivaTasaDefault: '8', preciosIncluyenIva: true, politicaCobro: 'SOLO_CAJA' } };
      const r: any = await controller.findByTenant(TENANT_A);
      expect(r.posCapabilities).toEqual({ ivaTasaDefault: '8', preciosIncluyenIva: true });
    });

    it('cambiarlo exige ADMIN o SOPORTE (PUT y POST de /tenant-settings/:tenantId)', () => {
      const roles = (fn: any) => Reflect.getMetadata(ROLES_KEY, fn);
      expect(roles(TenantSettingsController.prototype.update)).toEqual(['ADMIN', 'SOPORTE']);
      expect(roles(TenantSettingsController.prototype.upsert)).toEqual(['ADMIN', 'SOPORTE']);
    });
  });
});

// El cálculo puro: sin tasa fija, con redondeo por grupo (compatible con lo de siempre) y con precios incluidos.
describe('calcularTotalesIva — redondeo y compatibilidad', () => {
  const l = (monto: number, tasaIva: any, ivaIncluido = false) => ({ monto, tasaIva, ivaIncluido });

  it('una sola tasa, sin IVA incluido: igual que antes — round2(neto × 16 %)', () => {
    expect(calcularTotalesIva([l(33.33, '16'), l(66.67, '16')])).toMatchObject({ base: 100, impuestos: 16, total: 116 });
    expect(calcularTotalesIva([l(10.03, '16')])).toMatchObject({ impuestos: 1.6, total: 11.63 }); // 1.6048 → 1.60
  });

  it('IVA incluido: base + impuestos == total siempre, sin centavos perdidos', () => {
    for (const monto of [0.01, 9.99, 33.33, 100, 1234.56]) {
      const t = calcularTotalesIva([l(monto, '16', true)]);
      expect(Math.round((t.base + t.impuestos) * 100) / 100).toBe(monto);
      expect(t.total).toBe(monto);
    }
  });

  it('0 % y EXENTO no suman impuesto y se reportan por separado', () => {
    const t = calcularTotalesIva([l(100, '0'), l(50, 'EXENTO')]);
    expect(t).toMatchObject({ base: 150, impuestos: 0, total: 150 });
    expect(t.porTasa['0']).toEqual({ base: 100, impuestos: 0 });
    expect(t.porTasa.EXENTO).toEqual({ base: 50, impuestos: 0 });
  });
});

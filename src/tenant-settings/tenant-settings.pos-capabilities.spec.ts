import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TenantSettingsService } from './tenant-settings.service';
import { TenantSetting } from './entities/tenant-setting.entity';
import { DEFAULT_POS_CAPABILITIES } from '../config/pos-capabilities.config';

// POS flexible, capacidad 1 de 5 (venta_directa_producto): valida el contrato central —
// hasPosCapability() cae al default sin fila poblada (nadie que ya usa el POS se rompe),
// upsert() mergea en vez de reemplazar (activar una capacidad no borra las otras), y el
// aislamiento por tenant (aunque el guard HTTP ya lo cubre en el controller — ver
// tenant-settings.tenant-isolation.spec.ts — aquí se prueba que el propio service nunca lee
// ni escribe la fila de OTRO tenant).
describe('TenantSettingsService — posCapabilities', () => {
  let service: TenantSettingsService;
  let repo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock; update: jest.Mock };

  const TENANT_A = 'tenant-A';
  const TENANT_B = 'tenant-B';

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn((data) => Promise.resolve({ id: 'setting-nuevo', ...data })),
      update: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TenantSettingsService, { provide: getRepositoryToken(TenantSetting), useValue: repo }],
    }).compile();

    service = module.get<TenantSettingsService>(TenantSettingsService);
  });

  describe('hasPosCapability() — cae al default sin romper a nadie', () => {
    it('tenant sin fila de settings: usa el default del catálogo (venta_directa_producto = true)', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.hasPosCapability(TENANT_A, 'venta_directa_producto')).resolves.toBe(true);
    });

    it('tenant con fila pero posCapabilities null: usa el default del catálogo', async () => {
      repo.findOne.mockResolvedValue({ tenantId: TENANT_A, posCapabilities: null });
      await expect(service.hasPosCapability(TENANT_A, 'venta_directa_producto')).resolves.toBe(true);
    });

    // mesas_cuenta_abierta no tiene UI todavía: ningún tenant debe tenerla activa sin que alguien la
    // prenda a propósito. El único default en true es venta_directa_producto (el POS de siempre).
    it('catálogo: solo venta_directa_producto está activa por defecto; mesas_cuenta_abierta es false', () => {
      expect(DEFAULT_POS_CAPABILITIES.mesas_cuenta_abierta).toBe(false);
      const activasPorDefecto = Object.entries(DEFAULT_POS_CAPABILITIES).filter(([, v]) => v).map(([k]) => k);
      expect(activasPorDefecto).toEqual(['venta_directa_producto']);
    });

    it('capacidad aún no construida (mesas_cuenta_abierta): default false, sin fila', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.hasPosCapability(TENANT_A, 'mesas_cuenta_abierta')).resolves.toBe(false);
    });

    it('valor explícito guardado (override a false) gana sobre el default true', async () => {
      repo.findOne.mockResolvedValue({ tenantId: TENANT_A, posCapabilities: { venta_directa_producto: false } });
      await expect(service.hasPosCapability(TENANT_A, 'venta_directa_producto')).resolves.toBe(false);
    });

    it('valor explícito guardado (override a true) gana sobre el default false', async () => {
      repo.findOne.mockResolvedValue({ tenantId: TENANT_A, posCapabilities: { mesas_cuenta_abierta: true } });
      await expect(service.hasPosCapability(TENANT_A, 'mesas_cuenta_abierta')).resolves.toBe(true);
    });

    it('posCapabilities tiene OTRAS claves pero no la consultada: cae al default de esa clave puntual', async () => {
      repo.findOne.mockResolvedValue({ tenantId: TENANT_A, posCapabilities: { mesas_cuenta_abierta: true } });
      await expect(service.hasPosCapability(TENANT_A, 'venta_directa_producto')).resolves.toBe(true);
    });
  });

  describe('upsert() — merge, no reemplazo', () => {
    it('activar/tocar UNA capacidad no borra las otras ya guardadas en la fila existente', async () => {
      repo.findOne.mockResolvedValue({
        id: 'setting-1',
        tenantId: TENANT_A,
        posCapabilities: { venta_directa_producto: true, mesas_cuenta_abierta: true },
      });

      await service.upsert(TENANT_A, { posCapabilities: { venta_de_servicio: true } });

      expect(repo.update).toHaveBeenCalledWith(
        'setting-1',
        expect.objectContaining({
          posCapabilities: { venta_directa_producto: true, mesas_cuenta_abierta: true, venta_de_servicio: true },
        }),
      );
    });

    it('override explícito de una capacidad existente SÍ cambia esa clave puntual (no la ignora)', async () => {
      repo.findOne.mockResolvedValue({
        id: 'setting-1',
        tenantId: TENANT_A,
        posCapabilities: { venta_directa_producto: true },
      });

      await service.upsert(TENANT_A, { posCapabilities: { venta_directa_producto: false } });

      expect(repo.update).toHaveBeenCalledWith(
        'setting-1',
        expect.objectContaining({ posCapabilities: { venta_directa_producto: false } }),
      );
    });

    it('un upsert que NO toca posCapabilities no lo incluye en el payload de update (no lo pisa con undefined/null)', async () => {
      repo.findOne.mockResolvedValue({
        id: 'setting-1',
        tenantId: TENANT_A,
        posCapabilities: { venta_directa_producto: true },
      });

      await service.upsert(TENANT_A, { primaryColor: '#000' });

      const payload = repo.update.mock.calls[0][1];
      expect(payload).not.toHaveProperty('posCapabilities');
    });

    it('tenant nuevo (sin fila): crea la fila con solo lo que mandó el body, sin inventar las otras 4', async () => {
      repo.findOne.mockResolvedValue(null);

      await service.upsert(TENANT_A, { posCapabilities: { venta_directa_producto: false } });

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ posCapabilities: { venta_directa_producto: false } }),
      );
    });

    it('tenant nuevo, upsert sin posCapabilities: la columna queda null (default del catálogo aplica después vía hasPosCapability())', async () => {
      repo.findOne.mockResolvedValue(null);

      await service.upsert(TENANT_A, { primaryColor: '#000' });

      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ posCapabilities: null }));
    });
  });

  describe('aislamiento por tenant', () => {
    it('hasPosCapability() consulta SOLO la fila del tenant pedido, nunca de otro', async () => {
      repo.findOne.mockResolvedValue({ tenantId: TENANT_B, posCapabilities: { venta_directa_producto: false } });

      await service.hasPosCapability(TENANT_B, 'venta_directa_producto');

      expect(repo.findOne).toHaveBeenCalledWith({ where: { tenantId: TENANT_B } });
    });

    it('activar una capacidad para el tenant A no toca la fila del tenant B', async () => {
      repo.findOne.mockResolvedValue({ id: 'setting-A', tenantId: TENANT_A, posCapabilities: {} });

      await service.upsert(TENANT_A, { posCapabilities: { venta_directa_producto: false } });

      expect(repo.findOne).toHaveBeenCalledWith({ where: { tenantId: TENANT_A } });
      expect(repo.update).toHaveBeenCalledWith('setting-A', expect.anything());
    });
  });
});

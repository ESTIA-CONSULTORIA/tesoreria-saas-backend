import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { Company } from './entities/company.entity';
import { Tenant } from '../tenants/entities/tenant.entity';

// Auditoría BUSINESS (hallazgo #2, transversal #6): create() confiaba en el tenantId que
// manda el cliente en el body sin cruzarlo contra el JWT; update()/remove()/findOne() no
// filtraban por tenant en absoluto. Mismo patrón que el hallazgo #1 (movements/transfers/banks).
describe('CompaniesController — prioridad tenantId JWT sobre body (create)', () => {
  let controller: CompaniesController;
  let service: { create: jest.Mock };

  const TENANT_A = 'tenant-A';
  const TENANT_B = 'tenant-B';

  beforeEach(async () => {
    service = { create: jest.fn().mockResolvedValue({ id: 'company-1' }) };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CompaniesController],
      providers: [{ provide: CompaniesService, useValue: service }],
    }).compile();
    controller = module.get<CompaniesController>(CompaniesController);
  });

  it('ignora el tenantId del body cuando el JWT trae uno propio (ADMIN de tenant-A no puede crear en tenant-B)', async () => {
    await controller.create(
      { tenantId: TENANT_B, legalName: 'Empresa colada', tradeName: 'Colada' } as any,
      { user: { tenantId: TENANT_A } } as any,
    );

    expect(service.create).toHaveBeenCalledWith(TENANT_A, 'Empresa colada', 'Colada', undefined, undefined);
  });

  it('usa el tenantId del body solo cuando el JWT no trae uno (SOPORTE dando de alta un tenant específico)', async () => {
    await controller.create(
      { tenantId: TENANT_B, legalName: 'Empresa nueva', tradeName: 'Nueva' } as any,
      { user: { tenantId: undefined } } as any,
    );

    expect(service.create).toHaveBeenCalledWith(TENANT_B, 'Empresa nueva', 'Nueva', undefined, undefined);
  });
});

describe('CompaniesService — aislamiento por tenant (update/remove/findOne)', () => {
  let service: CompaniesService;
  let companiesRepo: { findOne: jest.Mock; update: jest.Mock; delete: jest.Mock };
  let tenantRepo: { findOne: jest.Mock };

  const TENANT_A = 'tenant-A';
  const TENANT_B = 'tenant-B';
  const COMPANY_B = 'company-B';

  function fakeCompanyLookup(where: { id: string; tenantId?: string }) {
    if (where.id !== COMPANY_B) return Promise.resolve(null);
    if (where.tenantId && where.tenantId !== TENANT_B) return Promise.resolve(null);
    return Promise.resolve({ id: COMPANY_B, tenantId: TENANT_B, legalName: 'Empresa B' });
  }

  beforeEach(async () => {
    companiesRepo = {
      findOne: jest.fn(({ where }) => fakeCompanyLookup(where)),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    tenantRepo = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompaniesService,
        { provide: getRepositoryToken(Company), useValue: companiesRepo },
        { provide: getRepositoryToken(Tenant), useValue: tenantRepo },
      ],
    }).compile();

    service = module.get<CompaniesService>(CompaniesService);
  });

  describe('findOne()', () => {
    it('no devuelve la empresa de OTRO tenant', async () => {
      await expect(service.findOne(COMPANY_B, TENANT_A)).resolves.toBeNull();
    });

    it('sí devuelve la empresa del MISMO tenant', async () => {
      await expect(service.findOne(COMPANY_B, TENANT_B)).resolves.toBeDefined();
    });
  });

  describe('update()', () => {
    it('rechaza editar la empresa de OTRO tenant', async () => {
      await expect(service.update(COMPANY_B, { legalName: 'hackeada' }, TENANT_A)).rejects.toThrow();
      expect(companiesRepo.update).not.toHaveBeenCalled();
    });

    it('permite editar la empresa del MISMO tenant', async () => {
      await expect(service.update(COMPANY_B, { legalName: 'nuevo nombre' }, TENANT_B)).resolves.toBeDefined();
      expect(companiesRepo.update).toHaveBeenCalledWith(COMPANY_B, { legalName: 'nuevo nombre' });
    });
  });

  describe('remove()', () => {
    it('rechaza borrar la empresa de OTRO tenant', async () => {
      await expect(service.remove(COMPANY_B, TENANT_A)).rejects.toThrow();
      expect(companiesRepo.delete).not.toHaveBeenCalled();
    });

    it('permite borrar la empresa del MISMO tenant', async () => {
      await expect(service.remove(COMPANY_B, TENANT_B)).resolves.toBeDefined();
      expect(companiesRepo.delete).toHaveBeenCalledWith(COMPANY_B);
    });
  });
});

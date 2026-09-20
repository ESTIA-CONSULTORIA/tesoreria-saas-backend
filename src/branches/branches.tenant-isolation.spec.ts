import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BranchesService } from './branches.service';
import { Branch } from './entities/branch.entity';
import { Company } from '../companies/entities/company.entity';
import { Tenant } from '../tenants/entities/tenant.entity';

// Auditoría BUSINESS (hallazgo #2, transversal #6): create() no verificaba que companyId
// fuera una empresa del tenant que crea la sucursal; update()/remove()/findByCompany() no
// filtraban por tenant/empresa en absoluto. Mismo patrón que el hallazgo #1.
describe('BranchesService — aislamiento por tenant', () => {
  let service: BranchesService;
  let branchesRepo: { findOne: jest.Mock; find: jest.Mock; create: jest.Mock; save: jest.Mock; update: jest.Mock; delete: jest.Mock };
  let companiesRepo: { findOne: jest.Mock; find: jest.Mock };
  let tenantRepo: { findOne: jest.Mock };

  const TENANT_A = 'tenant-A';
  const TENANT_B = 'tenant-B';
  const COMPANY_B = 'company-B';
  const BRANCH_B = 'branch-B';

  function fakeCompanyLookup(where: { id: string; tenantId?: string }) {
    if (where.id !== COMPANY_B) return Promise.resolve(null);
    if (where.tenantId && where.tenantId !== TENANT_B) return Promise.resolve(null);
    return Promise.resolve({ id: COMPANY_B, tenantId: TENANT_B });
  }

  beforeEach(async () => {
    branchesRepo = {
      findOne: jest.fn(({ where }) => {
        if (where.id !== BRANCH_B) return Promise.resolve(null);
        return Promise.resolve({ id: BRANCH_B, companyId: COMPANY_B, name: 'Sucursal B' });
      }),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((data) => data),
      save: jest.fn((data) => Promise.resolve({ id: 'branch-new', ...data })),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    companiesRepo = {
      findOne: jest.fn(({ where }) => fakeCompanyLookup(where)),
      find: jest.fn().mockResolvedValue([]),
    };
    tenantRepo = { findOne: jest.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BranchesService,
        { provide: getRepositoryToken(Branch), useValue: branchesRepo },
        { provide: getRepositoryToken(Company), useValue: companiesRepo },
        { provide: getRepositoryToken(Tenant), useValue: tenantRepo },
      ],
    }).compile();

    service = module.get<BranchesService>(BranchesService);
  });

  describe('create()', () => {
    it('rechaza crear una sucursal en una empresa de OTRO tenant', async () => {
      await expect(
        service.create(COMPANY_B, 'SUC-01', 'Sucursal colada', undefined, undefined, undefined, TENANT_A),
      ).rejects.toThrow();
      expect(branchesRepo.save).not.toHaveBeenCalled();
    });

    it('permite crear una sucursal en una empresa del MISMO tenant', async () => {
      await expect(
        service.create(COMPANY_B, 'SUC-01', 'Sucursal propia', undefined, undefined, undefined, TENANT_B),
      ).resolves.toBeDefined();
      expect(branchesRepo.save).toHaveBeenCalled();
    });
  });

  describe('findByCompany()', () => {
    it('rechaza listar sucursales de una empresa de OTRO tenant', async () => {
      await expect(service.findByCompany(COMPANY_B, TENANT_A)).rejects.toThrow();
    });

    it('permite listar sucursales de una empresa del MISMO tenant', async () => {
      await expect(service.findByCompany(COMPANY_B, TENANT_B)).resolves.toBeDefined();
    });
  });

  describe('update()', () => {
    it('rechaza editar una sucursal de OTRO tenant', async () => {
      await expect(service.update(BRANCH_B, { name: 'hackeada' }, TENANT_A)).rejects.toThrow();
      expect(branchesRepo.update).not.toHaveBeenCalled();
    });

    it('permite editar una sucursal del MISMO tenant', async () => {
      await expect(service.update(BRANCH_B, { name: 'nuevo nombre' }, TENANT_B)).resolves.toBeDefined();
      expect(branchesRepo.update).toHaveBeenCalledWith(BRANCH_B, { name: 'nuevo nombre' });
    });
  });

  describe('remove()', () => {
    it('rechaza borrar una sucursal de OTRO tenant', async () => {
      await expect(service.remove(BRANCH_B, TENANT_A)).rejects.toThrow();
      expect(branchesRepo.delete).not.toHaveBeenCalled();
    });

    it('permite borrar una sucursal del MISMO tenant', async () => {
      await expect(service.remove(BRANCH_B, TENANT_B)).resolves.toBeDefined();
      expect(branchesRepo.delete).toHaveBeenCalledWith(BRANCH_B);
    });
  });
});

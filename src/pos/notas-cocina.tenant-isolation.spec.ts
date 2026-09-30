import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { NotasCocinaService } from './notas-cocina.service';
import { NotaCocina } from './entities/nota-cocina.entity';

// POS flexible, capacidad notas_cocina_barra. Módulo nuevo, construido con el patrón
// correcto desde el día uno (no una auditoría posterior): tenantId siempre viene del JWT vía
// el controller (nunca body/query — ver notas-cocina.controller.ts), y marcarPreparado()
// filtra por tenantId antes de mutar cualquier cosa.
describe('NotasCocinaService — aislamiento por tenant', () => {
  let service: NotasCocinaService;
  let repo: { find: jest.Mock; findOne: jest.Mock; update: jest.Mock };

  const TENANT_A = 'tenant-A';
  const TENANT_B = 'tenant-B';
  const NOTA_B = 'nota-de-tenant-b';

  function fakeLookup(where: { id: string; tenantId?: string }) {
    if (where.id !== NOTA_B) return Promise.resolve(null);
    if (where.tenantId && where.tenantId !== TENANT_B) return Promise.resolve(null);
    return Promise.resolve({
      id: NOTA_B,
      tenantId: TENANT_B,
      sucursalId: 'sucursal-B',
      estacion: 'COCINA',
      estado: 'PENDIENTE',
    });
  }

  beforeEach(async () => {
    repo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(({ where }) => fakeLookup(where)),
      update: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [NotasCocinaService, { provide: getRepositoryToken(NotaCocina), useValue: repo }],
    }).compile();

    service = module.get<NotasCocinaService>(NotasCocinaService);
  });

  describe('findPending()', () => {
    it('siempre filtra por tenantId, nunca lista sin ese filtro', async () => {
      await service.findPending(TENANT_A, 'sucursal-A', 'COCINA');
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_A, estado: 'PENDIENTE', sucursalId: 'sucursal-A', estacion: 'COCINA' }),
        }),
      );
    });

    it('sin sucursalId/estacion: sigue filtrando por tenantId + PENDIENTE, no agrega undefined al where', async () => {
      await service.findPending(TENANT_A);
      const { where } = repo.find.mock.calls[0][0];
      expect(where).toEqual({ tenantId: TENANT_A, estado: 'PENDIENTE' });
    });
  });

  describe('marcarPreparado()', () => {
    it('rechaza marcar como preparada una nota de OTRO tenant', async () => {
      await expect(service.marcarPreparado(NOTA_B, TENANT_A)).rejects.toThrow(NotFoundException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('permite marcar como preparada una nota del MISMO tenant', async () => {
      await expect(service.marcarPreparado(NOTA_B, TENANT_B)).resolves.toBeDefined();
      expect(repo.update).toHaveBeenCalledWith(NOTA_B, { estado: 'PREPARADO' });
    });
  });
});

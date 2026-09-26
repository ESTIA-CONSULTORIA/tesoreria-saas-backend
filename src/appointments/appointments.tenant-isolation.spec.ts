import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { Cita } from './entities/cita.entity';
import { Patient } from '../patients/entities/patient.entity';

// Módulo nuevo, construido con el patrón correcto desde el día uno (no una auditoría
// posterior): tenantId siempre viene del JWT vía el controller (nunca body/query — ver
// appointments.controller.ts), y cada método del service que toca una cita puntual filtra
// por tenantId antes de devolver o mutar cualquier cosa.
describe('AppointmentsService — aislamiento por tenant', () => {
  let service: AppointmentsService;
  let citasRepo: {
    findOne: jest.Mock;
    find: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let patientsRepo: { findOne: jest.Mock };

  const TENANT_A = 'tenant-A';
  const TENANT_B = 'tenant-B';
  const CITA_B = 'cita-de-tenant-b';

  function fakeCitaLookup(where: { id: string; tenantId?: string }) {
    if (where.id !== CITA_B) return Promise.resolve(null);
    if (where.tenantId && where.tenantId !== TENANT_B) return Promise.resolve(null);
    return Promise.resolve({
      id: CITA_B,
      tenantId: TENANT_B,
      doctor: 'Dr. López',
      fechaHora: new Date('2026-10-01T10:00:00.000Z'),
      duracionMinutos: 30,
      estado: 'PENDIENTE',
    });
  }

  beforeEach(async () => {
    citasRepo = {
      findOne: jest.fn(({ where }) => fakeCitaLookup(where)),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      }),
    };
    patientsRepo = { findOne: jest.fn().mockResolvedValue({ id: 'patient-1', tenantId: TENANT_A }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: getRepositoryToken(Cita), useValue: citasRepo },
        { provide: getRepositoryToken(Patient), useValue: patientsRepo },
      ],
    }).compile();

    service = module.get<AppointmentsService>(AppointmentsService);
  });

  describe('findOne()', () => {
    it('rechaza leer la cita de OTRO tenant', async () => {
      await expect(service.findOne(CITA_B, TENANT_A)).rejects.toThrow(NotFoundException);
    });
    it('permite leer la cita del MISMO tenant', async () => {
      await expect(service.findOne(CITA_B, TENANT_B)).resolves.toEqual(expect.objectContaining({ id: CITA_B }));
    });
  });

  describe('findAll()', () => {
    it('siempre filtra por tenantId, nunca devuelve todo sin filtro', async () => {
      await service.findAll(TENANT_A);
      expect(citasRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_A }) }),
      );
    });
  });

  describe('update()', () => {
    it('rechaza editar la cita de OTRO tenant', async () => {
      await expect(service.update(CITA_B, { notas: 'hackeado' }, TENANT_A)).rejects.toThrow(NotFoundException);
      expect(citasRepo.update).not.toHaveBeenCalled();
    });
    it('permite editar la cita del MISMO tenant', async () => {
      await expect(service.update(CITA_B, { notas: 'nota real' }, TENANT_B)).resolves.toBeDefined();
      expect(citasRepo.update).toHaveBeenCalled();
    });
  });

  describe('remove()', () => {
    it('rechaza borrar la cita de OTRO tenant', async () => {
      await expect(service.remove(CITA_B, TENANT_A)).rejects.toThrow(NotFoundException);
      expect(citasRepo.delete).not.toHaveBeenCalled();
    });
    it('permite borrar la cita del MISMO tenant', async () => {
      await expect(service.remove(CITA_B, TENANT_B)).resolves.toEqual({ deleted: true });
      expect(citasRepo.delete).toHaveBeenCalledWith(CITA_B);
    });
  });

  describe('confirmar() / completar() / cancelar()', () => {
    it('confirmar(): rechaza sobre la cita de OTRO tenant', async () => {
      await expect(service.confirmar(CITA_B, TENANT_A)).rejects.toThrow(NotFoundException);
      expect(citasRepo.update).not.toHaveBeenCalled();
    });
    it('confirmar(): permite sobre la cita del MISMO tenant', async () => {
      await expect(service.confirmar(CITA_B, TENANT_B)).resolves.toBeDefined();
    });
    it('completar(): rechaza sobre la cita de OTRO tenant', async () => {
      await expect(service.completar(CITA_B, TENANT_A)).rejects.toThrow(NotFoundException);
    });
    it('cancelar(): rechaza sobre la cita de OTRO tenant', async () => {
      await expect(service.cancelar(CITA_B, TENANT_A)).rejects.toThrow(NotFoundException);
      expect(citasRepo.update).not.toHaveBeenCalled();
    });
    it('cancelar(): permite sobre la cita del MISMO tenant', async () => {
      await expect(service.cancelar(CITA_B, TENANT_B)).resolves.toBeDefined();
    });
  });
});

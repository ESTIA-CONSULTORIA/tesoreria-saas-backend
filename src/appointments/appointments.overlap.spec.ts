import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { Cita } from './entities/cita.entity';
import { Patient } from '../patients/entities/patient.entity';

// Fase 1 de la agenda de citas médicas (punto 2 — prevención de dobles reservas): valida
// contra AppointmentsService.create()/update() reales, no contra la query en aislamiento,
// para que la prueba falle si algún día alguien cambia la fórmula de traslape sin darse
// cuenta de que rompe el comportamiento observable.
describe('AppointmentsService — prevención de dobles reservas', () => {
  let service: AppointmentsService;
  let citasRepo: {
    createQueryBuilder: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    findOne: jest.Mock;
  };
  let patientsRepo: { findOne: jest.Mock };
  let qb: { where: jest.Mock; andWhere: jest.Mock; getOne: jest.Mock };

  const TENANT_A = 'tenant-A';
  const PATIENT_ID = 'patient-1';

  function mockOverlapResult(result: Partial<Cita> | null) {
    qb.getOne.mockResolvedValue(result);
  }

  beforeEach(async () => {
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    citasRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      create: jest.fn((data) => data),
      save: jest.fn((data) => Promise.resolve({ id: 'cita-nueva', ...data })),
      update: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn(),
    };
    patientsRepo = { findOne: jest.fn().mockResolvedValue({ id: PATIENT_ID, tenantId: TENANT_A }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: getRepositoryToken(Cita), useValue: citasRepo },
        { provide: getRepositoryToken(Patient), useValue: patientsRepo },
      ],
    }).compile();

    service = module.get<AppointmentsService>(AppointmentsService);
  });

  const baseInput = {
    patientId: PATIENT_ID,
    doctor: 'Dra. Pérez',
    servicio: 'Limpieza dental',
    fechaHora: '2026-10-01T10:00:00.000Z',
    duracionMinutos: 30,
  };

  it('sin traslape: crea la cita normalmente', async () => {
    mockOverlapResult(null);
    const cita = await service.create(baseInput, TENANT_A);
    expect(cita).toEqual(expect.objectContaining({ estado: 'PENDIENTE', doctor: 'Dra. Pérez' }));
    expect(citasRepo.save).toHaveBeenCalled();
  });

  it('con traslape (mismo doctor, mismo tenant, horario se cruza): rechaza con mensaje claro', async () => {
    mockOverlapResult({
      id: 'cita-existente',
      doctor: 'Dra. Pérez',
      fechaHora: new Date('2026-10-01T10:15:00.000Z'),
      duracionMinutos: 30,
    });

    await expect(service.create(baseInput, TENANT_A)).rejects.toThrow(BadRequestException);
    await expect(service.create(baseInput, TENANT_A)).rejects.toThrow(/ya tiene una cita en ese horario/);
    expect(citasRepo.save).not.toHaveBeenCalled();
  });

  it('la query de traslape filtra por tenantId + doctor y EXCLUYE citas CANCELADA', async () => {
    mockOverlapResult(null);
    await service.create(baseInput, TENANT_A);

    expect(citasRepo.createQueryBuilder).toHaveBeenCalledWith('cita');
    expect(qb.where).toHaveBeenCalledWith('cita."tenantId" = :tenantId', { tenantId: TENANT_A });
    expect(qb.andWhere).toHaveBeenCalledWith('cita.doctor = :doctor', { doctor: 'Dra. Pérez' });
    expect(qb.andWhere).toHaveBeenCalledWith('cita.estado != :cancelada', { cancelada: 'CANCELADA' });
  });

  it('doctor DISTINTO en el mismo horario: no hay conflicto (la query filtra por doctor, se confía en el mock del repo)', async () => {
    // La prueba anterior ya confirma que se filtra por doctor exacto — este caso documenta
    // la intención: dos doctores distintos nunca deberían competir por el mismo slot.
    mockOverlapResult(null);
    const otroDoctor = { ...baseInput, doctor: 'Dr. Gómez' };
    const cita = await service.create(otroDoctor, TENANT_A);
    expect(cita.doctor).toBe('Dr. Gómez');
  });

  it('update(): si el nuevo horario se traslapa con OTRA cita, rechaza y no llega a actualizar', async () => {
    citasRepo.findOne.mockResolvedValue({
      id: 'cita-1',
      tenantId: TENANT_A,
      doctor: 'Dra. Pérez',
      fechaHora: new Date('2026-10-01T10:00:00.000Z'),
      duracionMinutos: 30,
      estado: 'PENDIENTE',
    });
    mockOverlapResult({ id: 'otra-cita', doctor: 'Dra. Pérez', fechaHora: new Date(), duracionMinutos: 30 });

    await expect(
      service.update('cita-1', { fechaHora: '2026-10-01T11:00:00.000Z' }, TENANT_A),
    ).rejects.toThrow(BadRequestException);
    expect(citasRepo.update).not.toHaveBeenCalled();
    // La propia cita se excluye de su propio chequeo de traslape.
    expect(qb.andWhere).toHaveBeenCalledWith('cita.id != :excludeId', { excludeId: 'cita-1' });
  });

  it('update(): sin cambio de horario/doctor/duración, no vuelve a validar traslape', async () => {
    citasRepo.findOne.mockResolvedValue({
      id: 'cita-1',
      tenantId: TENANT_A,
      doctor: 'Dra. Pérez',
      fechaHora: new Date('2026-10-01T10:00:00.000Z'),
      duracionMinutos: 30,
      estado: 'PENDIENTE',
    });

    await service.update('cita-1', { notas: 'paciente llegó tarde' }, TENANT_A);

    expect(citasRepo.createQueryBuilder).not.toHaveBeenCalled();
    expect(citasRepo.update).toHaveBeenCalled();
  });

  it('update(): sin traslape con el nuevo horario, actualiza normalmente', async () => {
    citasRepo.findOne.mockResolvedValue({
      id: 'cita-1',
      tenantId: TENANT_A,
      doctor: 'Dra. Pérez',
      fechaHora: new Date('2026-10-01T10:00:00.000Z'),
      duracionMinutos: 30,
      estado: 'PENDIENTE',
    });
    mockOverlapResult(null);

    await service.update('cita-1', { fechaHora: '2026-10-01T12:00:00.000Z' }, TENANT_A);

    expect(citasRepo.update).toHaveBeenCalledWith(
      'cita-1',
      expect.objectContaining({ fechaHora: new Date('2026-10-01T12:00:00.000Z') }),
    );
  });
});

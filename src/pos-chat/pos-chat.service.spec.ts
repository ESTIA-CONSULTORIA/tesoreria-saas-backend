import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PosChatService } from './pos-chat.service';
import { PosMessage } from './entities/pos-message.entity';
import { Shift } from '../pos/entities/shift.entity';

// Chat del corte: el turno debe ser del tenant de quien llama (leer, escribir, aprobar y rechazar) y solo ADMIN, GERENTE y
// SOPORTE aprueban o rechazan. Antes cualquier usuario autenticado leía y aprobaba el corte de cualquier tenant.
const TENANT_A = 'tenant-A';
const TENANT_B = 'tenant-B';

describe('PosChatService — aprobación del corte', () => {
  let service: PosChatService;
  let mensajes: any[];

  beforeEach(async () => {
    mensajes = [];
    const turnos = [{ id: 'turno-A', tenantId: TENANT_A }];
    const msgRepo = {
      create: jest.fn((d) => d),
      save: jest.fn((d) => { const m = { id: `m-${mensajes.length + 1}`, createdAt: new Date(), ...d }; mensajes.push(m); return Promise.resolve(m); }),
      find: jest.fn(({ where }) => Promise.resolve(mensajes.filter((m) => m.turnoId === where.turnoId))),
    };
    const shiftsRepo = {
      findOne: jest.fn(({ where }) => Promise.resolve(turnos.find((t) => t.id === where.id && t.tenantId === where.tenantId) ?? null)),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PosChatService,
        { provide: getRepositoryToken(PosMessage), useValue: msgRepo },
        { provide: getRepositoryToken(Shift), useValue: shiftsRepo },
      ],
    }).compile();
    service = module.get(PosChatService);
  });

  it('flujo normal: el cajero pide aprobación y el gerente aprueba; ambos mensajes quedan en el turno', async () => {
    await service.sendMessage('turno-A', 'u-cajero', 'Caja', 'CAJERO', 'Corte listo', 'APPROVAL_REQUEST', TENANT_A);
    await service.approve('turno-A', 'u-gerente', 'Gerente', 'GERENTE', undefined, TENANT_A);
    const hilo = await service.getMessages('turno-A', TENANT_A, 'CAJERO');
    expect(hilo.map((m) => [m.role, m.type, m.message])).toEqual([
      ['CAJERO', 'APPROVAL_REQUEST', 'Corte listo'],
      ['GERENTE', 'APPROVAL', 'Corte aprobado.'],
    ]);
  });

  it.each(['CAJERO', 'CAPITAN', 'MESERO', 'CONTADOR', ''])('%s no aprueba ni rechaza: 403 y no queda mensaje', async (rol) => {
    await expect(service.approve('turno-A', 'u', 'U', rol, undefined, TENANT_A)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.reject('turno-A', 'u', 'U', rol, 'no', TENANT_A)).rejects.toBeInstanceOf(ForbiddenException);
    expect(mensajes).toHaveLength(0);
  });

  it('un mensaje normal no se puede hacer pasar por aprobación: type APPROVAL por la vía de mensajes exige rol', async () => {
    await expect(service.sendMessage('turno-A', 'u', 'U', 'CAJERO', 'aprobado', 'APPROVAL', TENANT_A)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.sendMessage('turno-A', 'u', 'U', 'CAJERO', 'x', 'LO-QUE-SEA', TENANT_A)).resolves.toMatchObject({ type: 'TEXT' });
  });

  it.each(['ADMIN', 'GERENTE'])('%s aprueba y rechaza con su comentario', async (rol) => {
    await service.approve('turno-A', 'u', 'U', rol, 'cuadra', TENANT_A);
    await service.reject('turno-A', 'u', 'U', rol, 'faltan $7', TENANT_A);
    expect(mensajes.map((m) => [m.type, m.message])).toEqual([['APPROVAL', 'cuadra'], ['REJECTION', 'faltan $7']]);
  });

  it('aislamiento de tenant: otro tenant no lee, escribe, aprueba ni rechaza el chat de un turno ajeno', async () => {
    await expect(service.getMessages('turno-A', TENANT_B, 'ADMIN')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.sendMessage('turno-A', 'u', 'U', 'CAJERO', 'hola', 'TEXT', TENANT_B)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.approve('turno-A', 'u', 'U', 'ADMIN', undefined, TENANT_B)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.reject('turno-A', 'u', 'U', 'GERENTE', 'x', TENANT_B)).rejects.toBeInstanceOf(NotFoundException);
    expect(mensajes).toHaveLength(0);
  });

  it('sin tenant en el token (y no SOPORTE): 404; SOPORTE conserva acceso a cualquier turno', async () => {
    await expect(service.getMessages('turno-A', undefined, 'CAJERO')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getMessages('turno-A', undefined, 'SOPORTE')).resolves.toEqual([]);
    await service.approve('turno-A', 'u-soporte', 'Soporte', 'SOPORTE');
    expect(mensajes).toHaveLength(1);
  });
});

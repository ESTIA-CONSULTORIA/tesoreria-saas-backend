import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Cita } from './entities/cita.entity';
import { Patient } from '../patients/entities/patient.entity';

export interface CreateCitaInput {
  patientId: string;
  doctor: string;
  servicio: string;
  fechaHora: string | Date;
  duracionMinutos?: number;
  notas?: string;
}

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectRepository(Cita)
    private citasRepo: Repository<Cita>,
    @InjectRepository(Patient)
    private patientsRepo: Repository<Patient>,
  ) {}

  private calcularFin(fechaHora: Date, duracionMinutos: number): Date {
    return new Date(fechaHora.getTime() + duracionMinutos * 60000);
  }

  // Fase 1 de la agenda de citas médicas (punto 2 — prevención de dobles reservas): dos
  // citas del MISMO doctor, dentro del MISMO tenant, se traslapan si el inicio de una es
  // antes del fin de la otra y viceversa (fórmula estándar de intersección de intervalos:
  // startA < endB && startB < endA — aquí end se calcula como fechaHora + duracionMinutos
  // directo en SQL, sin traerlo a memoria). Una cita CANCELADA no ocupa el horario — cancelar
  // de verdad libera el espacio, no lo deja fantasma bloqueando reservas nuevas.
  private async findOverlap(
    tenantId: string,
    doctor: string,
    start: Date,
    end: Date,
    excludeId?: string,
  ): Promise<Cita | null> {
    const qb = this.citasRepo
      .createQueryBuilder('cita')
      .where('cita."tenantId" = :tenantId', { tenantId })
      .andWhere('cita.doctor = :doctor', { doctor })
      .andWhere('cita.estado != :cancelada', { cancelada: 'CANCELADA' })
      .andWhere('cita."fechaHora" < :end', { end })
      .andWhere(`cita."fechaHora" + (cita."duracionMinutos" || ' minutes')::interval > :start`, { start });

    if (excludeId) {
      qb.andWhere('cita.id != :excludeId', { excludeId });
    }

    return qb.getOne();
  }

  // tenantId siempre viene del JWT (ver appointments.controller.ts) — módulo nuevo,
  // construido con el patrón correcto desde el día uno, no una auditoría posterior.
  async create(data: CreateCitaInput, tenantId: string, companyId?: string): Promise<Cita> {
    const patient = await this.patientsRepo.findOne({ where: { id: data.patientId, tenantId } });
    if (!patient) {
      throw new BadRequestException('Paciente no encontrado');
    }

    const fechaHora = new Date(data.fechaHora);
    if (isNaN(fechaHora.getTime())) {
      throw new BadRequestException('fechaHora inválida');
    }
    const duracionMinutos = data.duracionMinutos ?? 30;
    if (duracionMinutos <= 0) {
      throw new BadRequestException('duracionMinutos debe ser mayor a cero');
    }

    const fin = this.calcularFin(fechaHora, duracionMinutos);
    const conflicto = await this.findOverlap(tenantId, data.doctor, fechaHora, fin);
    if (conflicto) {
      throw new BadRequestException(
        `El doctor ${data.doctor} ya tiene una cita en ese horario (${conflicto.fechaHora.toISOString()}, ${conflicto.duracionMinutos} min) — no se puede agendar.`,
      );
    }

    const cita = this.citasRepo.create({
      patientId: data.patientId,
      doctor: data.doctor,
      servicio: data.servicio,
      fechaHora,
      duracionMinutos,
      notas: data.notas,
      estado: 'PENDIENTE',
      tenantId,
      companyId,
    });
    return this.citasRepo.save(cita);
  }

  // Vista de agenda/calendario: sin from/to devuelve todas las citas del tenant (orden
  // cronológico); con ambos, filtra por rango.
  findAll(tenantId: string, from?: Date, to?: Date): Promise<Cita[]> {
    const where: any = { tenantId };
    if (from && to) {
      where.fechaHora = Between(from, to);
    }
    return this.citasRepo.find({ where, order: { fechaHora: 'ASC' } });
  }

  async findOne(id: string, tenantId: string): Promise<Cita> {
    const cita = await this.citasRepo.findOne({ where: { id, tenantId } });
    if (!cita) {
      throw new NotFoundException('Cita no encontrada');
    }
    return cita;
  }

  async update(id: string, data: Partial<CreateCitaInput>, tenantId: string): Promise<Cita> {
    const existing = await this.findOne(id, tenantId);

    if (data.patientId && data.patientId !== existing.patientId) {
      const patient = await this.patientsRepo.findOne({ where: { id: data.patientId, tenantId } });
      if (!patient) {
        throw new BadRequestException('Paciente no encontrado');
      }
    }

    const doctor = data.doctor ?? existing.doctor;
    const fechaHora = data.fechaHora ? new Date(data.fechaHora) : existing.fechaHora;
    const duracionMinutos = data.duracionMinutos ?? existing.duracionMinutos;
    if (isNaN(fechaHora.getTime())) {
      throw new BadRequestException('fechaHora inválida');
    }

    // Solo re-valida el traslape si algo que afecta el horario cambió — evita rechazar una
    // edición que solo toca notas/servicio contra su propia cita.
    const cambioHorario =
      doctor !== existing.doctor ||
      fechaHora.getTime() !== existing.fechaHora.getTime() ||
      duracionMinutos !== existing.duracionMinutos;

    if (cambioHorario) {
      const fin = this.calcularFin(fechaHora, duracionMinutos);
      const conflicto = await this.findOverlap(tenantId, doctor, fechaHora, fin, id);
      if (conflicto) {
        throw new BadRequestException(
          `El doctor ${doctor} ya tiene una cita en ese horario (${conflicto.fechaHora.toISOString()}, ${conflicto.duracionMinutos} min) — no se puede reprogramar.`,
        );
      }
    }

    await this.citasRepo.update(id, { ...data, doctor, fechaHora, duracionMinutos });
    return this.findOne(id, tenantId);
  }

  async remove(id: string, tenantId: string): Promise<{ deleted: true }> {
    await this.findOne(id, tenantId);
    await this.citasRepo.delete(id);
    return { deleted: true };
  }

  // Cambios de estado — transición mínima razonable para esta fase, no un motor de estados
  // completo: ninguna de las tres aplica sobre una cita ya CANCELADA o COMPLETADA (estados
  // terminales, no tiene sentido reabrirlos desde estos endpoints).
  async confirmar(id: string, tenantId: string): Promise<Cita> {
    const cita = await this.findOne(id, tenantId);
    if (cita.estado !== 'PENDIENTE') {
      throw new BadRequestException(`Solo se puede confirmar una cita PENDIENTE (estado actual: ${cita.estado}).`);
    }
    await this.citasRepo.update(id, { estado: 'CONFIRMADA' });
    return this.findOne(id, tenantId);
  }

  async completar(id: string, tenantId: string): Promise<Cita> {
    const cita = await this.findOne(id, tenantId);
    if (cita.estado !== 'PENDIENTE' && cita.estado !== 'CONFIRMADA') {
      throw new BadRequestException(`No se puede completar una cita en estado ${cita.estado}.`);
    }
    await this.citasRepo.update(id, { estado: 'COMPLETADA' });
    return this.findOne(id, tenantId);
  }

  async cancelar(id: string, tenantId: string): Promise<Cita> {
    const cita = await this.findOne(id, tenantId);
    if (cita.estado === 'CANCELADA' || cita.estado === 'COMPLETADA') {
      throw new BadRequestException(`No se puede cancelar una cita en estado ${cita.estado}.`);
    }
    await this.citasRepo.update(id, { estado: 'CANCELADA' });
    return this.findOne(id, tenantId);
  }
}

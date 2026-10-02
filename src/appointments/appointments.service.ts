import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, EntityManager } from 'typeorm';
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

  // POS flexible, capacidad ligar_venta_a_cita: validación previa a ligar una venta. findOne()
  // ya filtra por tenant (cita de otro tenant → NotFoundException, mismo mensaje que "no
  // existe", sin revelar que el id existe en otro tenant). Una cita CANCELADA no se puede
  // ligar; COMPLETADA sí (puede haber un segundo pago/venta del mismo servicio).
  async assertLinkable(id: string, tenantId: string): Promise<Cita> {
    const cita = await this.findOne(id, tenantId);
    if (cita.estado === 'CANCELADA') {
      throw new BadRequestException('No se puede ligar una venta a una cita CANCELADA.');
    }
    return cita;
  }

  // Al completarse una venta ligada, la cita pasa a COMPLETADA solo si seguía PENDIENTE o
  // CONFIRMADA — cualquier otro estado (ya COMPLETADA por una venta anterior, o CANCELADA
  // entre la validación y el cobro) se deja como está, nunca lanza. `manager` opcional: la
  // venta lo pasa para que la transición viva en la MISMA transacción del cobro.
  async completarPorVenta(id: string, tenantId: string, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(Cita) : this.citasRepo;
    const cita = await repo.findOne({ where: { id, tenantId } });
    if (!cita) return;
    if (cita.estado === 'PENDIENTE' || cita.estado === 'CONFIRMADA') {
      await repo.update(id, { estado: 'COMPLETADA' });
    }
  }

  // Búsqueda para el POS (elegir qué cita ligar antes de cobrar): citas del tenant en el
  // rango (por default, el día de hoy), sin las CANCELADAS (no se pueden ligar), con el
  // nombre del paciente y filtrable por él. Patient no tiene FK real contra Cita.patientId,
  // así que el join es por igualdad de texto y se re-filtra por tenant en ambos lados.
  async searchForPos(
    tenantId: string,
    filters: { from?: Date; to?: Date; paciente?: string } = {},
  ): Promise<Array<Cita & { pacienteNombre: string | null }>> {
    const hoy = new Date();
    const from = filters.from ?? new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const to = filters.to ?? new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59, 999);

    const qb = this.citasRepo
      .createQueryBuilder('cita')
      .leftJoin(Patient, 'patient', 'patient.id::text = cita."patientId" AND patient."tenantId" = cita."tenantId"')
      .addSelect('patient.nombre', 'pacienteNombre')
      .where('cita."tenantId" = :tenantId', { tenantId })
      .andWhere('cita.estado != :cancelada', { cancelada: 'CANCELADA' })
      .andWhere('cita."fechaHora" BETWEEN :from AND :to', { from, to })
      .orderBy('cita."fechaHora"', 'ASC');

    if (filters.paciente?.trim()) {
      qb.andWhere('patient.nombre ILIKE :paciente', { paciente: `%${filters.paciente.trim()}%` });
    }

    const { entities, raw } = await qb.getRawAndEntities();
    return entities.map((cita, i) => Object.assign(cita, { pacienteNombre: (raw[i]?.pacienteNombre as string) ?? null }));
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

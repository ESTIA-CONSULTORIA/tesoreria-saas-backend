import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Patient } from './entities/patient.entity';
import { Consulta } from './entities/consulta.entity';

@Injectable()
export class PatientsService {
  constructor(
    @InjectRepository(Patient) private patientRepo: Repository<Patient>,
    @InjectRepository(Consulta) private consultaRepo: Repository<Consulta>,
  ) {}

  // Expedientes clínicos: SIEMPRE dentro del tenant del token. Con tenantId undefined TypeORM ignoraba la condición y devolvía los
  // pacientes (y consultas) de TODOS los negocios; ahora sin tenant no se lista nada y las rutas por id dan 404 si es ajeno.
  private async pacienteDe(id: string, tenantId: string) {
    const p = id && tenantId ? await this.patientRepo.findOne({ where: { id, tenantId } }) : null;
    if (!p) throw new NotFoundException('Paciente no encontrado');
    return p;
  }

  async findAll(tenantId: string, companyId?: string) {
    if (!tenantId) return [];
    return this.patientRepo.find({
      where: { tenantId, ...(companyId ? { companyId } : {}) },
      order: { createdAt: 'DESC' },
    });
  }

  findOne(id: string, tenantId: string) {
    return this.pacienteDe(id, tenantId);
  }

  async create(data: Partial<Patient>) {
    if (!data.tenantId) throw new BadRequestException('Falta el negocio del paciente');
    delete (data as any).id; // con id en el body save() pisaría el expediente de otro negocio
    const patient = this.patientRepo.create(data);
    return this.patientRepo.save(patient);
  }

  async update(id: string, data: Partial<Patient>, tenantId: string) {
    await this.pacienteDe(id, tenantId);
    delete (data as any).id;
    delete (data as any).tenantId; // el negocio de un expediente no se cambia
    await this.patientRepo.update(id, data);
    return this.pacienteDe(id, tenantId);
  }

  async findConsultas(tenantId: string, patientId?: string) {
    if (!tenantId) return [];
    return this.consultaRepo.find({
      where: { tenantId, ...(patientId ? { patientId } : {}) },
      order: { fecha: 'DESC' },
    });
  }

  async createConsulta(data: Partial<Consulta>) {
    if (!data.tenantId) throw new BadRequestException('Falta el negocio de la consulta');
    delete (data as any).id;
    // El paciente debe ser del tenant: antes se sumaban visitas al paciente de otro negocio
    const patient = await this.pacienteDe(data.patientId as string, data.tenantId);
    patient.numeroVisitas += 1;
    patient.tipo = 'recurrente';
    await this.patientRepo.save(patient);
    return this.consultaRepo.save(this.consultaRepo.create(data));
  }

  // tenantId = el del token (undefined = SOPORTE): la consulta debe ser de ese tenant; una id ajena es 404.
  async updateConsulta(id: string, data: Partial<Consulta>, tenantId?: string) {
    if (tenantId) {
      const c = await this.consultaRepo.findOne({ where: { id, tenantId } as any });
      if (!c) throw new NotFoundException('Consulta no encontrada');
    }
    delete (data as any).tenantId;
    delete (data as any).id;
    await this.consultaRepo.update(id, data);
    return this.consultaRepo.findOne({ where: { id } });
  }

  async getKpis(tenantId: string, from: Date, to: Date) {
    if (!tenantId) throw new BadRequestException('Falta el negocio');
    const consultas = await this.consultaRepo.find({
      where: { tenantId, fecha: Between(from, to) },
    });

    const pacientes = await this.patientRepo.find({ where: { tenantId } });

    const totalVenta = consultas.reduce((s, c) => s + Number(c.pagado), 0);
    const totalPendiente = consultas.reduce((s, c) => s + (Number(c.importe) - Number(c.pagado)), 0);
    const ticketPromedio = consultas.length > 0 ? totalVenta / consultas.length : 0;

    const byDoctor: Record<string, number> = {};
    for (const c of consultas) {
      byDoctor[c.doctor] = (byDoctor[c.doctor] || 0) + Number(c.pagado);
    }

    const nuevos = await this.patientRepo.count({
      where: { tenantId, createdAt: Between(from, to) },
    });

    const byMetodo: Record<string, number> = {};
    for (const c of consultas) {
      byMetodo[c.metodoPago] = (byMetodo[c.metodoPago] || 0) + Number(c.pagado);
    }

    return {
      totalConsultas: consultas.length,
      totalVenta,
      totalPendiente,
      ticketPromedio,
      pacientesNuevos: nuevos,
      pacientesRecurrentes: consultas.length - nuevos,
      byDoctor,
      byMetodo,
      totalPacientes: pacientes.length,
    };
  }
}

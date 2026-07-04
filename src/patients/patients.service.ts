import { Injectable } from '@nestjs/common';
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

  findAll(tenantId: string, companyId?: string) {
    return this.patientRepo.find({
      where: { tenantId, ...(companyId ? { companyId } : {}) },
      order: { createdAt: 'DESC' },
    });
  }

  findOne(id: string) {
    return this.patientRepo.findOne({ where: { id } });
  }

  async create(data: Partial<Patient>) {
    const patient = this.patientRepo.create(data);
    return this.patientRepo.save(patient);
  }

  async update(id: string, data: Partial<Patient>) {
    await this.patientRepo.update(id, data);
    return this.findOne(id);
  }

  findConsultas(tenantId: string, patientId?: string) {
    return this.consultaRepo.find({
      where: { tenantId, ...(patientId ? { patientId } : {}) },
      order: { fecha: 'DESC' },
    });
  }

  async createConsulta(data: Partial<Consulta>) {
    const patient = await this.patientRepo.findOne({ where: { id: data.patientId } });
    if (patient) {
      patient.numeroVisitas += 1;
      patient.tipo = 'recurrente';
      await this.patientRepo.save(patient);
    }
    return this.consultaRepo.save(this.consultaRepo.create(data));
  }

  async updateConsulta(id: string, data: Partial<Consulta>) {
    await this.consultaRepo.update(id, data);
    return this.consultaRepo.findOne({ where: { id } });
  }

  async getKpis(tenantId: string, from: Date, to: Date) {
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

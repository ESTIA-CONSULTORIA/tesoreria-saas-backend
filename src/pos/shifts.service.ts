import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shift } from './entities/shift.entity';

@Injectable()
export class ShiftsService {
  constructor(
    @InjectRepository(Shift)
    private shiftsRepo: Repository<Shift>,
  ) {}

  async openShift(data: {
    cajero: string;
    sucursalId: string;
    tenantId: string;
    fondoInicial: number;
    notas?: string;
  }) {
    try {
      const now = new Date();
      const shift = this.shiftsRepo.create();
      shift.cajero = data.cajero;
      shift.sucursalId = data.sucursalId;
      shift.tenantId = data.tenantId;
      shift.fecha = now;
      shift.horaApertura = now.toTimeString().slice(0, 8);
      shift.fondoInicial = data.fondoInicial;
      shift.totalVentas = 0;
      shift.totalEfectivo = 0;
      shift.totalTarjeta = 0;
      shift.totalTransferencia = 0;
      shift.totalCortesia = 0;
      shift.totalDevoluciones = 0;
      shift.status = 'ABIERTO';
      shift.notas = data.notas || '';
      return this.shiftsRepo.save(shift);
    } catch (error) {
      console.error('ShiftsService.openShift error:', error);
      throw new Error(`Error al abrir turno: ${error.message}`);
    }
  }

  async closeShift(id: string, data: {
    totalVentas: number;
    totalEfectivo: number;
    totalTarjeta: number;
    totalTransferencia: number;
    totalCortesia: number;
    totalDevoluciones: number;
    notas?: string;
  }) {
    try {
      const shift = await this.shiftsRepo.findOne({ where: { id } });
      if (!shift) {
        throw new Error('Turno no encontrado');
      }
      if (shift.status !== 'ABIERTO') {
        throw new Error('El turno ya está cerrado');
      }

      const now = new Date();
      await this.shiftsRepo.update(id, {
        horaCierre: now.toTimeString().slice(0, 8),
        totalVentas: data.totalVentas,
        totalEfectivo: data.totalEfectivo,
        totalTarjeta: data.totalTarjeta,
        totalTransferencia: data.totalTransferencia,
        totalCortesia: data.totalCortesia,
        totalDevoluciones: data.totalDevoluciones,
        status: 'CERRADO',
        notas: data.notas || shift.notas,
      });

      return this.shiftsRepo.findOne({ where: { id } });
    } catch (error) {
      console.error('ShiftsService.closeShift error:', error);
      throw new Error(`Error al cerrar turno: ${error.message}`);
    }
  }

  async findOpenShift(cajero: string, sucursalId: string) {
    try {
      return this.shiftsRepo.findOne({
        where: {
          cajero,
          sucursalId,
          status: 'ABIERTO',
        },
        order: { createdAt: 'DESC' },
      });
    } catch (error) {
      console.error('ShiftsService.findOpenShift error:', error);
      throw new Error(`Error al buscar turno abierto: ${error.message}`);
    }
  }

  async findAll(filters?: {
    cajero?: string;
    sucursalId?: string;
    tenantId?: string;
    status?: string;
    fechaInicio?: Date;
    fechaFin?: Date;
  }) {
    try {
      const query = this.shiftsRepo.createQueryBuilder('shift');

      if (filters?.cajero) {
        query.andWhere('shift.cajero = :cajero', { cajero: filters.cajero });
      }
      if (filters?.sucursalId) {
        query.andWhere('shift.sucursalId = :sucursalId', { sucursalId: filters.sucursalId });
      }
      if (filters?.tenantId) {
        query.andWhere('shift.tenantId = :tenantId', { tenantId: filters.tenantId });
      }
      if (filters?.status) {
        query.andWhere('shift.status = :status', { status: filters.status });
      }
      if (filters?.fechaInicio) {
        query.andWhere('shift.fecha >= :fechaInicio', { fechaInicio: filters.fechaInicio });
      }
      if (filters?.fechaFin) {
        query.andWhere('shift.fecha <= :fechaFin', { fechaFin: filters.fechaFin });
      }

      return query.orderBy('shift.createdAt', 'DESC').getMany();
    } catch (error) {
      console.error('ShiftsService.findAll error:', error);
      throw new Error(`Error al obtener turnos: ${error.message}`);
    }
  }

  async findOne(id: string) {
    try {
      return this.shiftsRepo.findOne({ where: { id } });
    } catch (error) {
      console.error('ShiftsService.findOne error:', error);
      throw new Error(`Error al obtener turno: ${error.message}`);
    }
  }
}

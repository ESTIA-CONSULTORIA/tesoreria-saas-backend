import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shift } from './entities/shift.entity';
import { Sale } from './entities/sale.entity';

@Injectable()
export class ShiftsService {
  constructor(
    @InjectRepository(Shift)
    private shiftsRepo: Repository<Shift>,
    @InjectRepository(Sale)
    private salesRepo: Repository<Sale>,
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

  async withdrawal(id: string, data: {
    monto: number;
    motivo: string;
    autorizadoPor: string;
  }) {
    try {
      const shift = await this.shiftsRepo.findOne({ where: { id } });
      if (!shift) {
        throw new Error('Turno no encontrado');
      }
      if (shift.status !== 'ABIERTO') {
        throw new Error('El turno no está abierto');
      }

      // Update shift totals
      const newTotalRetiros = Number(shift.totalRetiros || 0) + data.monto;
      await this.shiftsRepo.update(id, {
        totalRetiros: newTotalRetiros,
      });

      return this.shiftsRepo.findOne({ where: { id } });
    } catch (error) {
      console.error('ShiftsService.withdrawal error:', error);
      throw new Error(`Error al registrar retiro: ${error.message}`);
    }
  }

  async deposit(id: string, data: {
    monto: number;
    origen: string;
    autorizadoPor: string;
  }) {
    try {
      const shift = await this.shiftsRepo.findOne({ where: { id } });
      if (!shift) {
        throw new Error('Turno no encontrado');
      }
      if (shift.status !== 'ABIERTO') {
        throw new Error('El turno no está abierto');
      }

      // Update shift totals - deposits increase effective cash
      const newTotalDepositos = Number(shift.totalDepositos || 0) + data.monto;
      await this.shiftsRepo.update(id, {
        totalDepositos: newTotalDepositos,
      });

      return this.shiftsRepo.findOne({ where: { id } });
    } catch (error) {
      console.error('ShiftsService.deposit error:', error);
      throw new Error(`Error al registrar depósito: ${error.message}`);
    }
  }

  async precut(id: string, data: {
    efectivoContado: number;
    efectivoDenominaciones?: Record<string, number>;
    debitoDeclarado?: number;
    creditoDeclarado?: number;
    transferenciaDeclarada?: number;
    valesDeclarados?: number;
  }) {
    try {
      const shift = await this.shiftsRepo.findOne({ where: { id } });
      if (!shift) {
        throw new Error('Turno no encontrado');
      }
      if (shift.status !== 'ABIERTO') {
        throw new Error('El turno no está abierto');
      }
      if (shift.precorteGuardado) {
        throw new Error('El precorte ya fue guardado');
      }

      // Save precorte declaration and mark as saved
      const declaracion = {
        efectivoContado: data.efectivoContado,
        efectivoDenominaciones: data.efectivoDenominaciones || {},
        debitoDeclarado: data.debitoDeclarado || 0,
        creditoDeclarado: data.creditoDeclarado || 0,
        transferenciaDeclarada: data.transferenciaDeclarada || 0,
        valesDeclarados: data.valesDeclarados || 0,
        fechaPrecorte: new Date().toISOString(),
      };
      
      await this.shiftsRepo.update(id, {
        efectivoContado: data.efectivoContado,
        precorteGuardado: true,
        precorteDeclaracion: declaracion as any,
      });

      return this.shiftsRepo.findOne({ where: { id } });
    } catch (error) {
      console.error('ShiftsService.precut error:', error);
      throw new Error(`Error al guardar precorte: ${error.message}`);
    }
  }

  async closeShift(id: string, data: {
    efectivoContado?: number;
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
      if (!shift.precorteGuardado) {
        throw new Error('Debe realizar el precorte antes del corte Z');
      }

      // Calculate real totals from actual paid sales in this shift
      const sales = await this.salesRepo.find({ where: { turnoId: id, status: 'PAGADA' } });
      let calcTotalVentas = 0;
      let calcTotalEfectivo = 0;
      let calcTotalTarjeta = 0;
      let calcTotalTransferencia = 0;
      let calcTotalCortesia = 0;

      for (const sale of sales) {
        calcTotalVentas += Number(sale.total) || 0;
        if (Array.isArray(sale.formasPago) && sale.formasPago.length > 0) {
          for (const fp of sale.formasPago) {
            const monto = Number(fp.monto) || 0;
            switch (fp.forma) {
              case 'EFECTIVO': calcTotalEfectivo += monto; break;
              case 'DEBITO':
              case 'CREDITO':
              case 'TARJETA': calcTotalTarjeta += monto; break;
              case 'TRANSFERENCIA': calcTotalTransferencia += monto; break;
              case 'CORTESIA': calcTotalCortesia += monto; break;
            }
          }
        } else if (sale.formaPago) {
          switch (sale.formaPago) {
            case 'EFECTIVO': calcTotalEfectivo += Number(sale.total); break;
            case 'DEBITO':
            case 'CREDITO':
            case 'TARJETA': calcTotalTarjeta += Number(sale.total); break;
            case 'TRANSFERENCIA': calcTotalTransferencia += Number(sale.total); break;
            case 'CORTESIA': calcTotalCortesia += Number(sale.total); break;
          }
        }
      }

      const cancelledSales = await this.salesRepo.find({ where: { turnoId: id, status: 'CANCELADA' } });
      const calcTotalDevoluciones = cancelledSales.reduce((sum, s) => sum + (Number(s.total) || 0), 0);

      const now = new Date();
      await this.shiftsRepo.update(id, {
        horaCierre: now.toTimeString().slice(0, 8),
        totalVentas: calcTotalVentas,
        totalEfectivo: calcTotalEfectivo,
        totalTarjeta: calcTotalTarjeta,
        totalTransferencia: calcTotalTransferencia,
        totalCortesia: calcTotalCortesia,
        totalDevoluciones: calcTotalDevoluciones,
        totalRetiros: Number(shift.totalRetiros) || 0,
        totalDepositos: Number(shift.totalDepositos) || 0,
        efectivoContado: data.efectivoContado ?? Number(shift.efectivoContado) ?? 0,
        status: 'CERRADO',
        notas: data.notas || shift.notas,
      });

      return this.shiftsRepo.findOne({ where: { id } });
    } catch (error) {
      console.error('ShiftsService.closeShift error:', error);
      throw new Error(`Error al cerrar turno: ${error.message}`);
    }
  }

  async findOpenShift(cajero: string, sucursalId: string, tenantId?: string) {
    try {
      // Primero intentar con tenantId
      if (tenantId) {
        const shift = await this.shiftsRepo.findOne({
          where: { status: 'ABIERTO', tenantId },
          order: { createdAt: 'DESC' },
        });
        if (shift) return shift;
      }

      // Fallback: buscar cualquier turno abierto, filtrando por sucursalId si se proporciona
      const whereConditions: any = { status: 'ABIERTO' };
      if (sucursalId) {
        whereConditions.sucursalId = sucursalId;
      }

      return this.shiftsRepo.findOne({
        where: whereConditions,
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

  async getSummary(id: string) {
    try {
      const shift = await this.shiftsRepo.findOne({ where: { id } });
      if (!shift) {
        throw new Error('Turno no encontrado');
      }

      // Get all sales for this shift
      const sales = await this.salesRepo.find({ where: { turnoId: id } });

      // Calculate totals by payment form
      let totalVentasEfectivo = 0;
      let totalVentasDebito = 0;
      let totalVentasCredito = 0;
      let totalVentasSPEI = 0;
      let totalVentasCortesia = 0;

      sales.forEach(sale => {
        if (Array.isArray(sale.formasPago)) {
          sale.formasPago.forEach((fp: any) => {
            const monto = Number(fp.monto) || 0;
            switch (fp.forma) {
              case 'EFECTIVO':
                totalVentasEfectivo += monto;
                break;
              case 'DEBITO':
                totalVentasDebito += monto;
                break;
              case 'CREDITO':
                totalVentasCredito += monto;
                break;
              case 'TRANSFERENCIA':
                totalVentasSPEI += monto;
                break;
              case 'CORTESIA':
                totalVentasCortesia += monto;
                break;
            }
          });
        } else {
          // Fallback for old single payment form
          const forma = sale.formaPago;
          const monto = Number(sale.total) || 0;
          switch (forma) {
            case 'EFECTIVO':
              totalVentasEfectivo += monto;
              break;
            case 'DEBITO':
              totalVentasDebito += monto;
              break;
            case 'CREDITO':
              totalVentasCredito += monto;
              break;
            case 'TRANSFERENCIA':
              totalVentasSPEI += monto;
              break;
            case 'CORTESIA':
              totalVentasCortesia += monto;
              break;
          }
        }
      });

      const totalRetiros = Number(shift.totalRetiros) || 0;
      const totalDepositos = Number(shift.totalDepositos) || 0;
      const fondoInicial = Number(shift.fondoInicial) || 0;
      const efectivoEsperado = fondoInicial + totalVentasEfectivo + totalDepositos - totalRetiros;

      // Return complete shift summary with calculated totals
      return {
        ...shift,
        precorteDeclaracion: shift.precorteDeclaracion || null,
        calculatedTotals: {
          totalVentasEfectivo,
          totalVentasDebito,
          totalVentasCredito,
          totalVentasSPEI,
          totalVentasCortesia,
          totalRetiros,
          totalDepositos,
          efectivoEsperado,
        },
      };
    } catch (error) {
      console.error('ShiftsService.getSummary error:', error);
      throw new Error(`Error al obtener resumen del turno: ${error.message}`);
    }
  }
}

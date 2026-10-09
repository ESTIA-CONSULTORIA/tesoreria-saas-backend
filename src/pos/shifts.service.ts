import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { Shift } from './entities/shift.entity';
import { Sale } from './entities/sale.entity';
import { resolveEventTimestamp } from '../common/resolve-event-timestamp.util';

// Efectivo cobrado FUERA DE CAJA (origen MESA: POS Lite, o ERP con MESERO/CAPITAN), por persona. Sale de
// formasPago[].cobradoPor* de las cuentas de mesa (JSON, sin migración). Es efectivo que físicamente tiene quien lo
// cobró y que el efectivo esperado ya incluye: este desglose permite cuadrarlo con cada quien.
export function efectivoFueraDeCaja(sales: Sale[]) {
  const porPersona = new Map<string, { email: string; id: string | null; rol: string | null; monto: number }>();
  for (const sale of sales) {
    for (const p of Array.isArray(sale.formasPago) ? sale.formasPago : []) {
      if (p.forma !== 'EFECTIVO' || p.origen !== 'MESA') continue;
      const email = p.cobradoPorEmail || 'sin asignar';
      const e = porPersona.get(email) ?? { email, id: p.cobradoPorId ?? null, rol: p.cobradoPorRol ?? null, monto: 0 };
      e.monto = Math.round((e.monto + (Number(p.monto) || 0)) * 100) / 100;
      porPersona.set(email, e);
    }
  }
  const personas = [...porPersona.values()].sort((a, b) => b.monto - a.monto);
  return { personas, total: Math.round(personas.reduce((s, x) => s + x.monto, 0) * 100) / 100 };
}

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
    clientTimestamp?: string;
  }) {
    // Fuera del try: un clientTimestamp inválido debe llegar al cliente como 400
    // (BadRequestException), no enmascararse como 500 por el catch genérico de abajo.
    const now = resolveEventTimestamp(data.clientTimestamp);
    try {
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

  // Auditoría BUSINESS (hallazgo transversal #6): withdrawal()/deposit()/precut()/
  // closeShift()/findOne()/getSummary() no verificaban que el turno perteneciera al tenant
  // de quien llama — Shift sí tiene tenantId propio, se reutiliza el mismo mensaje "Turno no
  // encontrado" que ya usa cada catch, sin cambiar el formato de error existente.
  private round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  // Un retiro o depósito es un monto positivo: antes un monto negativo (o un texto, que se concatenaba) movía el efectivo
  // esperado del corte a gusto de quien lo mandara.
  private montoValido(monto: unknown): number {
    const n = typeof monto === 'string' && monto.trim() !== '' ? Number(monto) : (monto as number);
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) {
      throw new BadRequestException('monto debe ser un número mayor a cero.');
    }
    return this.round2(n);
  }

  async withdrawal(id: string, data: {
    monto: number;
    motivo: string;
    autorizadoPor: string;
  }, tenantId?: string) {
    const monto = this.montoValido(data?.monto);
    try {
      const shift = await this.shiftsRepo.findOne({ where: tenantId ? { id, tenantId } : { id } });
      if (!shift) {
        throw new Error('Turno no encontrado');
      }
      if (shift.status !== 'ABIERTO') {
        throw new Error('El turno no está abierto');
      }

      // Update shift totals
      const newTotalRetiros = this.round2(Number(shift.totalRetiros || 0) + monto);
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
  }, tenantId?: string) {
    const monto = this.montoValido(data?.monto);
    try {
      const shift = await this.shiftsRepo.findOne({ where: tenantId ? { id, tenantId } : { id } });
      if (!shift) {
        throw new Error('Turno no encontrado');
      }
      if (shift.status !== 'ABIERTO') {
        throw new Error('El turno no está abierto');
      }

      // Update shift totals - deposits increase effective cash
      const newTotalDepositos = this.round2(Number(shift.totalDepositos || 0) + monto);
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
  }, tenantId?: string) {
    try {
      const shift = await this.shiftsRepo.findOne({ where: tenantId ? { id, tenantId } : { id } });
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
    clientTimestamp?: string;
  }, tenantId?: string) {
    // Fuera del try, mismo motivo que en openShift.
    const now = resolveEventTimestamp(data.clientTimestamp);
    try {
      const shift = await this.shiftsRepo.findOne({ where: tenantId ? { id, tenantId } : { id } });
      if (!shift) {
        throw new Error('Turno no encontrado');
      }
      if (shift.status !== 'ABIERTO') {
        throw new Error('El turno ya está cerrado');
      }
      if (!shift.precorteGuardado) {
        throw new Error('Debe realizar el precorte antes del corte Z');
      }

      // POS flexible, capacidad mesas_cuenta_abierta: el corte solo suma ventas PAGADA. Una cuenta
      // abierta en este turno (con o sin cobros parciales) quedaría fuera del corte, y al cobrarse
      // después seguiría ligada a este turno ya cerrado — el efectivo no cuadraría nunca. Por eso
      // el corte Z se bloquea mientras haya cuentas abiertas en mesas: hay que cobrarlas o
      // cancelarlas antes.
      const cuentasAbiertas = await this.salesRepo.count({
        where: { turnoId: id, status: 'ABIERTA', tableId: Not(IsNull()) },
      });
      if (cuentasAbiertas > 0) {
        throw new BadRequestException(`No se puede cerrar el turno: hay ${cuentasAbiertas} cuenta(s) abierta(s) en mesas. Cóbralas o cancélalas antes del corte Z.`);
      }

      // Calculate real totals from actual paid sales in this shift
      // 'DEVUELTA' = venta PAGADA que luego se devolvió: sigue siendo venta bruta del turno donde
      // se hizo (totalVentas no se resta). La devolución en sí vive como una venta 'DEVOLUCION' en
      // el turno donde se hizo y entra abajo, una sola vez.
      const sales = await this.salesRepo.find({ where: { turnoId: id, status: In(['PAGADA', 'DEVUELTA']) } });
      let calcTotalVentas = 0;
      let calcTotalEfectivo = 0;
      let calcTotalTarjeta = 0;
      let calcTotalTransferencia = 0;
      let calcTotalCortesia = 0;

      // signo = 1 suma el cobro de una venta; -1 resta el reembolso de una devolución.
      const aplicarPagos = (sale: Sale, signo: 1 | -1) => {
        const aplicar = (forma: string, monto: number) => {
          switch (forma) {
            case 'EFECTIVO': calcTotalEfectivo += signo * monto; break;
            case 'DEBITO':
            case 'CREDITO':
            case 'TARJETA': calcTotalTarjeta += signo * monto; break;
            case 'TRANSFERENCIA': calcTotalTransferencia += signo * monto; break;
            // La cortesía no mueve dinero: una devolución no la resta.
            case 'CORTESIA': if (signo === 1) calcTotalCortesia += monto; break;
          }
        };
        if (Array.isArray(sale.formasPago) && sale.formasPago.length > 0) {
          for (const fp of sale.formasPago) aplicar(fp.forma, Number(fp.monto) || 0);
        } else if (sale.formaPago) {
          aplicar(sale.formaPago, Number(sale.total));
        }
      };

      for (const sale of sales) {
        calcTotalVentas += Number(sale.total) || 0;
        aplicarPagos(sale, 1);
      }

      // Devoluciones hechas en este turno (de ventas de este o de turnos anteriores): reembolso
      // por la misma forma de pago con la que se cobró la original.
      const devoluciones = await this.salesRepo.find({ where: { turnoId: id, status: 'DEVOLUCION' } });
      let calcDevolucionesDeVentas = 0;
      for (const dev of devoluciones) {
        calcDevolucionesDeVentas += Number(dev.total) || 0;
        aplicarPagos(dev, -1);
      }

      const cancelledSales = await this.salesRepo.find({ where: { turnoId: id, status: 'CANCELADA' } });
      // Una cuenta abierta de mesa cancelada sin cobro nunca recibió dinero: no hay nada que
      // devolver, así que no cuenta como devolución. Las ventas que sí se cobraron (PAGADA
      // canceladas después) cuentan igual que siempre.
      const huboCobro = (s: Sale) => (Array.isArray(s.formasPago) && s.formasPago.length > 0) || !!s.formaPago;
      const calcTotalDevoluciones = calcDevolucionesDeVentas + cancelledSales
        .filter((s) => !(s.tableId && !huboCobro(s)))
        .reduce((sum, s) => sum + (Number(s.total) || 0), 0);

      // Lo que debería haber en la caja y la diferencia contra lo contado (contado − esperado: negativo = faltante).
      // No se guardan (Shift no tiene columnas para ellos, sin migración): se calculan aquí y en getSummary().
      const efectivoContadoFinal = data.efectivoContado ?? Number(shift.efectivoContado) ?? 0;
      const efectivoEsperado = this.round2(
        (Number(shift.fondoInicial) || 0) + calcTotalEfectivo + (Number(shift.totalDepositos) || 0) - (Number(shift.totalRetiros) || 0),
      );
      const diferencia = this.round2(Number(efectivoContadoFinal) - efectivoEsperado);

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

      const cerrado = await this.shiftsRepo.findOne({ where: { id } });
      // El desglose no se guarda (Shift no tiene columna para él): se calcula de las ventas y se puede volver a pedir
      // en getSummary() también para un turno ya cerrado.
      return cerrado ? { ...cerrado, efectivoEsperado, diferencia, efectivoPorPersona: efectivoFueraDeCaja(sales) } : cerrado;
    } catch (error) {
      console.error('ShiftsService.closeShift error:', error);
      if (error instanceof HttpException) throw error;
      throw new Error(`Error al cerrar turno: ${error.message}`);
    }
  }

  async findOpenShift(cajero: string, sucursalId: string, tenantId?: string) {
    try {
      // Primero intentar con tenantId
      if (tenantId) {
        const shift = await this.shiftsRepo.findOne({
          where: { status: 'ABIERTO', tenantId, cajero },
          order: { createdAt: 'DESC' },
        });
        if (shift) return shift;
      }

      // Fallback: buscar turno abierto del mismo cajero, filtrando por sucursalId si se proporciona
      const whereConditions: any = { status: 'ABIERTO', cajero };
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

  async findOne(id: string, tenantId?: string) {
    try {
      return this.shiftsRepo.findOne({ where: tenantId ? { id, tenantId } : { id } });
    } catch (error) {
      console.error('ShiftsService.findOne error:', error);
      throw new Error(`Error al obtener turno: ${error.message}`);
    }
  }

  async getSummary(id: string, tenantId?: string) {
    try {
      const shift = await this.shiftsRepo.findOne({ where: tenantId ? { id, tenantId } : { id } });
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
        // Una devolución (status 'DEVOLUCION') es un reembolso: resta de la forma de pago con la
        // que se cobró la original. La cortesía no mueve dinero, no se resta.
        const signo = sale.status === 'DEVOLUCION' ? -1 : 1;
        if (Array.isArray(sale.formasPago)) {
          sale.formasPago.forEach((fp: any) => {
            const monto = (Number(fp.monto) || 0) * signo;
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
                if (signo === 1) totalVentasCortesia += monto;
                break;
            }
          });
        } else {
          // Fallback for old single payment form
          const forma = sale.formaPago;
          const monto = (Number(sale.total) || 0) * signo;
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
              if (signo === 1) totalVentasCortesia += monto;
              break;
          }
        }
      });

      const totalRetiros = Number(shift.totalRetiros) || 0;
      const totalDepositos = Number(shift.totalDepositos) || 0;
      const fondoInicial = Number(shift.fondoInicial) || 0;
      const efectivoEsperado = fondoInicial + totalVentasEfectivo + totalDepositos - totalRetiros;
      // contado − esperado (negativo = faltante); solo si ya hay un conteo (precorte o cierre).
      const efectivoContado = shift.efectivoContado === null || shift.efectivoContado === undefined ? null : Number(shift.efectivoContado);
      const diferencia = efectivoContado === null ? null : this.round2(efectivoContado - efectivoEsperado);

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
          diferencia,
          // Efectivo cobrado fuera de caja (mesa), por persona: ya está incluido en efectivoEsperado.
          efectivoPorPersona: efectivoFueraDeCaja(sales),
        },
      };
    } catch (error) {
      console.error('ShiftsService.getSummary error:', error);
      throw new Error(`Error al obtener resumen del turno: ${error.message}`);
    }
  }

  async createBackfillShift(data: {
    cajero: string;
    sucursalId: string;
    tenantId: string;
    fecha: string; // 'YYYY-MM-DD'
    fondoInicial: number;
    totalVentas?: number;
    totalEfectivo?: number;
    totalTarjeta?: number;
    totalTransferencia?: number;
    totalCortesia?: number;
    totalDevoluciones?: number;
    totalRetiros?: number;
    totalDepositos?: number;
    efectivoContado?: number;
    notas?: string;
  }) {
    try {
      const now = new Date();
      const shift = this.shiftsRepo.create();
      shift.cajero = data.cajero;
      shift.sucursalId = data.sucursalId;
      shift.tenantId = data.tenantId;
      shift.fecha = new Date(data.fecha); // fecha de negocio elegida por el admin
      shift.horaApertura = now.toTimeString().slice(0, 8); // hora real de captura (servidor)
      shift.horaCierre = now.toTimeString().slice(0, 8);
      shift.fondoInicial = data.fondoInicial || 0;
      shift.totalVentas = data.totalVentas || 0;
      shift.totalEfectivo = data.totalEfectivo || 0;
      shift.totalTarjeta = data.totalTarjeta || 0;
      shift.totalTransferencia = data.totalTransferencia || 0;
      shift.totalCortesia = data.totalCortesia || 0;
      shift.totalDevoluciones = data.totalDevoluciones || 0;
      shift.totalRetiros = data.totalRetiros || 0;
      shift.totalDepositos = data.totalDepositos || 0;
      shift.efectivoContado = data.efectivoContado ?? 0;
      shift.precorteGuardado = true;
      shift.status = 'CERRADO';
      shift.esRetroactivo = true;
      shift.notas = `[CAPTURA RETROACTIVA — registrada el ${now.toISOString()}] ${data.notas || ''}`.trim();
      return this.shiftsRepo.save(shift);
    } catch (error) {
      console.error('ShiftsService.createBackfillShift error:', error);
      throw new Error(`Error al capturar corte retroactivo: ${error.message}`);
    }
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { Socio } from './entities/socio.entity';
import { PlanMembresia } from './entities/plan-membresia.entity';
import { Membresia } from './entities/membresia.entity';
import { finDePeriodo, hoyLocal, inicioDeRenovacion, situacionDeSocio } from './membresias.util';

// Lo que el POS necesita de membresías, en un servicio SIN dependencia de SalesService (evita el ciclo de módulos):
//  · prepararVenta()      antes de calcular la venta: qué plan se cobra, a qué socio y qué descuento de beneficio lleva
//  · activarPorVenta()    dentro de la transacción de la venta: crea el periodo (cobro o renovación)
//  · cancelarPorVenta()   dentro de la transacción de la devolución: el periodo cobrado deja de valer
// El precio y el IVA NO se calculan aquí: el plan es un producto del POS y los calcula create() como el de cualquier producto.
export interface VentaPreparada {
  items: any[];
  socio: Socio | null;
  plan: PlanMembresia | null;
  beneficioPct: number; // descuento de beneficio aplicado a los ítems que no son la membresía (0 si no hubo)
  nota: string; // texto para las notas de la venta
}

@Injectable()
export class MembresiasCoreService {
  constructor(
    @InjectRepository(Socio) private sociosRepo: Repository<Socio>,
    @InjectRepository(PlanMembresia) private planesRepo: Repository<PlanMembresia>,
    @InjectRepository(Membresia) private membresiasRepo: Repository<Membresia>,
  ) {}

  async prepararVenta(input: {
    socioId?: string;
    items: any[];
    tenantId: string;
    permitirBeneficio: boolean; // false en una cuenta abierta de mesa (el descuento va por PUT /discount)
    nacePagada: boolean;
  }): Promise<VentaPreparada> {
    const { tenantId } = input;
    const ids = [...new Set((input.items || []).map((i: any) => i?.productoId).filter((x: unknown): x is string => typeof x === 'string'))];
    const planes = ids.length ? await this.planesRepo.find({ where: { tenantId, productId: In(ids) } }) : [];
    const porProducto = new Map(planes.map((p) => [p.productId as string, p]));
    const lineasPlan = (input.items || []).filter((i: any) => porProducto.has(i?.productoId));

    if (lineasPlan.length > 1) {
      throw new BadRequestException('Cobra una sola membresía por venta.');
    }
    const plan = lineasPlan.length === 1 ? porProducto.get(lineasPlan[0].productoId)! : null;
    if (plan) {
      if (Number(lineasPlan[0].cantidad) !== 1) throw new BadRequestException('La membresía se cobra de una en una (cantidad 1).');
      if (!plan.activo) throw new BadRequestException(`El plan "${plan.nombre}" está desactivado: no se puede cobrar.`);
      if (!input.nacePagada) throw new BadRequestException('Una membresía se cobra al momento: indica las formas de pago.');
      if (!input.socioId) throw new BadRequestException('Las membresías se cobran eligiendo al socio (socioId).');
    }

    let socio: Socio | null = null;
    if (input.socioId) {
      // Mismo mensaje si no existe o es de otro negocio: no revela de quién es.
      socio = await this.sociosRepo.findOne({ where: { id: input.socioId, tenantId } });
      if (!socio) throw new BadRequestException('Socio no encontrado.');
      if (socio.estado !== 'ACTIVO') throw new BadRequestException(`El socio ${socio.numeroSocio} está dado de baja.`);
    }

    // Beneficio: descuento del plan vigente del socio sobre lo que NO es la membresía. Se mete como descuento por ítem y
    // pasa por calcularImportes(): ahí se aplican los topes por rol (403 si el beneficio rebasa el del que cobra).
    let items = input.items;
    let beneficioPct = 0;
    if (socio && input.permitirBeneficio) {
      const periodos = await this.membresiasRepo.find({ where: { tenantId, socioId: socio.id } });
      const sit = situacionDeSocio(periodos, hoyLocal());
      if (sit.estado === 'VIGENTE' && sit.periodo?.planId) {
        const planVigente = await this.planesRepo.findOne({ where: { id: sit.periodo.planId, tenantId } });
        beneficioPct = Math.max(0, Math.min(100, Number(planVigente?.beneficios?.descuentoPct) || 0));
      }
      if (beneficioPct > 0) {
        items = items.map((it: any) =>
          porProducto.has(it?.productoId) ? it : { ...it, descuento: Math.max(Number(it?.descuento) || 0, beneficioPct) },
        );
      }
    }

    const nota = socio
      ? `[Socio #${socio.numeroSocio} ${socio.nombre}${plan ? ` · ${plan.nombre}` : ''}${beneficioPct > 0 ? ` · beneficio ${beneficioPct}%` : ''}]`
      : '';
    return { items, socio, plan, beneficioPct, nota };
  }

  // Dentro de la transacción de la venta (mismo `manager`): si la venta se revierte, la membresía no queda. El socio se bloquea
  // para que dos cobros simultáneos del mismo socio se encadenen en vez de traslaparse.
  async activarPorVenta(
    manager: EntityManager,
    p: { tenantId: string; socioId: string; plan: PlanMembresia; venta: { id: string; folio: string; total: number }; creadoPor?: string },
  ): Promise<Membresia> {
    const socio = await manager.findOne(Socio, { where: { id: p.socioId, tenantId: p.tenantId }, lock: { mode: 'pessimistic_write' } });
    if (!socio) throw new BadRequestException('Socio no encontrado.');
    const periodos = await manager.find(Membresia, { where: { tenantId: p.tenantId, socioId: p.socioId } });
    if (periodos.some((m) => m.estado === 'CONGELADA')) {
      throw new BadRequestException('La membresía del socio está congelada: descongélala antes de renovar.');
    }
    const hoy = hoyLocal();
    const inicio = inicioDeRenovacion(periodos, hoy);
    const fin = finDePeriodo(inicio, p.plan.periodoTipo, p.plan.periodoCantidad);
    const fila = manager.create(Membresia, {
      tenantId: p.tenantId,
      socioId: p.socioId,
      planId: p.plan.id,
      planNombre: p.plan.nombre,
      precioPagado: p.venta.total,
      fechaInicio: inicio,
      fechaFin: fin,
      estado: 'ACTIVA',
      ventaId: p.venta.id,
      folioVenta: p.venta.folio,
      createdBy: p.creadoPor ?? null,
    });
    return manager.save(fila);
  }

  // Devolución de la venta de una membresía: ese periodo queda CANCELADO (no se borra: queda el rastro y el folio).
  async cancelarPorVenta(manager: EntityManager, ventaId: string, tenantId: string, motivo: string): Promise<number> {
    const filas = await manager.find(Membresia, { where: { tenantId, ventaId } });
    for (const m of filas) {
      if (m.estado === 'CANCELADA') continue;
      await manager.update(Membresia, m.id, {
        estado: 'CANCELADA',
        notas: [m.notas, `[CANCELADA] ${motivo}`].filter(Boolean).join(' · '),
        updatedAt: new Date(),
      });
    }
    return filas.length;
  }
}

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { Socio } from './entities/socio.entity';
import { BeneficiosPlan, PlanMembresia } from './entities/plan-membresia.entity';
import { Membresia } from './entities/membresia.entity';
import { CheckinSocio } from './entities/checkin-socio.entity';
import { Product } from '../pos/entities/product.entity';
import { PosCategory } from '../pos/entities/category.entity';
import { Sale } from '../pos/entities/sale.entity';
import { TenantSettingsService } from '../tenant-settings/tenant-settings.service';
import { NipThrottleService } from '../pos/nip-throttle.service';
import { isValidTasaIva, tasaNumerica, TASAS_IVA, TasaIva } from '../config/iva.config';
import {
  diasEntre, hashNip, hoyLocal, NIP_VALIDO, PeriodoTipo, situacionDeSocio, sumarDias, vigenteHoy,
} from './membresias.util';

const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const PERIODOS: PeriodoTipo[] = ['DIAS', 'MESES', 'ANOS'];

export interface PlanInput {
  nombre?: string;
  descripcion?: string | null;
  precio?: number | string;
  periodoTipo?: string;
  periodoCantidad?: number | string;
  tasaIva?: string | null;
  diasCongelacionMax?: number | string;
  beneficios?: BeneficiosPlan;
  activo?: boolean;
}

export interface SocioInput {
  numeroSocio?: string;
  nombre?: string;
  apellidos?: string | null;
  telefono?: string | null;
  email?: string | null;
  fechaNacimiento?: string | null;
  branchId?: string | null;
  notas?: string | null;
  nip?: string | null;
  estado?: string;
}

@Injectable()
export class MembresiasService {
  constructor(
    @InjectRepository(Socio) private sociosRepo: Repository<Socio>,
    @InjectRepository(PlanMembresia) private planesRepo: Repository<PlanMembresia>,
    @InjectRepository(Membresia) private membresiasRepo: Repository<Membresia>,
    @InjectRepository(CheckinSocio) private checkinsRepo: Repository<CheckinSocio>,
    @InjectRepository(Product) private productsRepo: Repository<Product>,
    @InjectRepository(PosCategory) private categoriesRepo: Repository<PosCategory>,
    @InjectRepository(Sale) private salesRepo: Repository<Sale>,
    private tenantSettings: TenantSettingsService,
    private nipThrottle: NipThrottleService,
  ) {}

  // ───────────────────────────── planes ─────────────────────────────
  listarPlanes(tenantId: string, soloActivos = false) {
    return this.planesRepo.find({ where: soloActivos ? { tenantId, activo: true } : { tenantId }, order: { nombre: 'ASC' } });
  }

  private validarPlan(d: PlanInput, parcial: boolean): Partial<PlanMembresia> {
    const out: Partial<PlanMembresia> = {};
    if (!parcial || d.nombre !== undefined) {
      const nombre = String(d.nombre ?? '').trim();
      if (!nombre) throw new BadRequestException('El plan necesita un nombre.');
      out.nombre = nombre;
    }
    if (!parcial || d.precio !== undefined) {
      const precio = r2(Number(d.precio));
      if (!Number.isFinite(precio) || precio < 0) throw new BadRequestException('El precio debe ser un número mayor o igual a cero.');
      out.precio = precio;
    }
    if (!parcial || d.periodoTipo !== undefined) {
      if (!PERIODOS.includes(d.periodoTipo as PeriodoTipo)) throw new BadRequestException('periodoTipo debe ser DIAS, MESES o ANOS.');
      out.periodoTipo = d.periodoTipo as PeriodoTipo;
    }
    if (!parcial || d.periodoCantidad !== undefined) {
      const c = Number(d.periodoCantidad);
      if (!Number.isInteger(c) || c <= 0 || c > 3650) throw new BadRequestException('periodoCantidad debe ser un entero mayor a cero.');
      out.periodoCantidad = c;
    }
    if (d.tasaIva !== undefined) {
      if (d.tasaIva === null || d.tasaIva === '') out.tasaIva = null;
      else if (isValidTasaIva(d.tasaIva)) out.tasaIva = d.tasaIva;
      else throw new BadRequestException(`tasaIva inválida: usa ${TASAS_IVA.join(', ')} o déjala vacía para usar la del negocio.`);
    }
    if (d.diasCongelacionMax !== undefined) {
      const n = Number(d.diasCongelacionMax);
      if (!Number.isInteger(n) || n < 0 || n > 365) throw new BadRequestException('diasCongelacionMax debe ser un entero entre 0 y 365.');
      out.diasCongelacionMax = n;
    }
    if (d.descripcion !== undefined) out.descripcion = d.descripcion ? String(d.descripcion).slice(0, 1000) : null;
    if (d.beneficios !== undefined) {
      const b = d.beneficios ?? {};
      const beneficios: BeneficiosPlan = {};
      if (b.descuentoPct !== undefined && b.descuentoPct !== null) {
        const pct = Number(b.descuentoPct);
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new BadRequestException('El descuento del beneficio debe estar entre 0 y 100.');
        if (pct > 0) beneficios.descuentoPct = pct;
      }
      if (b.notas !== undefined) {
        if (!Array.isArray(b.notas) || b.notas.length > 20) throw new BadRequestException('Las notas del beneficio son una lista de hasta 20 renglones.');
        beneficios.notas = b.notas.map((n) => String(n).trim().slice(0, 200)).filter(Boolean);
      }
      out.beneficios = beneficios;
    }
    if (d.activo !== undefined) out.activo = !!d.activo;
    return out;
  }

  private esDuplicado(e: unknown): boolean {
    return (e as { code?: string })?.code === '23505';
  }

  // El plan es un producto del POS (servicio, sin inventario): el cobro, el IVA, el descuento y el corte son los de siempre.
  async crearPlan(tenantId: string, d: PlanInput): Promise<PlanMembresia> {
    const datos = this.validarPlan(d, false);
    const existente = await this.planesRepo.findOne({ where: { tenantId, nombre: datos.nombre as string } });
    if (existente) throw new ConflictException(`Ya existe un plan llamado "${datos.nombre}".`);
    const producto = await this.productsRepo.save(
      this.productsRepo.create({
        tenantId,
        name: `Membresía: ${datos.nombre}`,
        price: datos.precio as number,
        type: 'SIMPLE',
        esServicio: true,
        isActive: datos.activo ?? true,
        ...(datos.tasaIva ? { tasaIva: datos.tasaIva } : {}),
      } as Partial<Product>),
    );
    try {
      return await this.planesRepo.save(
        this.planesRepo.create({ tenantId, diasCongelacionMax: 0, beneficios: {}, activo: true, ...datos, productId: producto.id } as Partial<PlanMembresia>),
      );
    } catch (e) {
      await this.productsRepo.delete(producto.id).catch(() => undefined); // no dejar un producto huérfano
      if (this.esDuplicado(e)) throw new ConflictException(`Ya existe un plan llamado "${datos.nombre}".`);
      throw e;
    }
  }

  async actualizarPlan(id: string, tenantId: string, d: PlanInput): Promise<PlanMembresia> {
    const plan = await this.planesRepo.findOne({ where: { id, tenantId } });
    if (!plan) throw new NotFoundException('Plan no encontrado.');
    const datos = this.validarPlan(d, true);
    if (datos.nombre && datos.nombre !== plan.nombre) {
      const otro = await this.planesRepo.findOne({ where: { tenantId, nombre: datos.nombre } });
      if (otro) throw new ConflictException(`Ya existe un plan llamado "${datos.nombre}".`);
    }
    await this.planesRepo.update(id, { ...datos, updatedAt: new Date() });
    const nuevo = (await this.planesRepo.findOne({ where: { id, tenantId } })) as PlanMembresia;
    if (nuevo.productId) {
      // Precio, nombre, tasa y estado del producto siguen al plan. Lo ya cobrado conserva su precio (membresias.precioPagado).
      await this.productsRepo.update(nuevo.productId, {
        name: `Membresía: ${nuevo.nombre}`,
        price: Number(nuevo.precio),
        tasaIva: nuevo.tasaIva ?? null,
        isActive: nuevo.activo,
        updatedAt: new Date(),
      } as any);
    }
    return nuevo;
  }

  // ───────────────────────────── socios ─────────────────────────────
  private async siguienteNumero(tenantId: string): Promise<string> {
    const filas = await this.sociosRepo.find({ where: { tenantId }, select: ['numeroSocio'] });
    const max = filas.reduce((m, s) => (/^\d+$/.test(s.numeroSocio) ? Math.max(m, Number(s.numeroSocio)) : m), 0);
    return String(max + 1);
  }

  async crearSocio(tenantId: string, d: SocioInput, branchIdActor?: string | null): Promise<Socio> {
    const nombre = String(d.nombre ?? '').trim();
    if (!nombre) throw new BadRequestException('El socio necesita un nombre.');
    if (d.nip !== undefined && d.nip !== null && d.nip !== '' && !NIP_VALIDO.test(String(d.nip))) {
      throw new BadRequestException('El NIP debe tener de 4 a 6 dígitos.');
    }
    let numero = String(d.numeroSocio ?? '').trim();
    if (!numero) numero = await this.siguienteNumero(tenantId);
    if (numero.length > 30) throw new BadRequestException('El número de socio es demasiado largo.');
    if (await this.sociosRepo.findOne({ where: { tenantId, numeroSocio: numero } })) {
      throw new ConflictException(`Ya existe un socio con el número ${numero}.`);
    }
    const nipHash = d.nip ? hashNip(tenantId, String(d.nip)) : null;
    if (nipHash && (await this.sociosRepo.findOne({ where: { tenantId, nipHash } }))) {
      throw new ConflictException('Ese NIP ya lo usa otro socio. Elige uno distinto.');
    }
    try {
      const guardado = await this.sociosRepo.save(
        this.sociosRepo.create({
          tenantId,
          branchId: d.branchId ?? branchIdActor ?? null,
          numeroSocio: numero,
          nombre,
          apellidos: d.apellidos ?? null,
          telefono: d.telefono ?? null,
          email: d.email ?? null,
          fechaNacimiento: d.fechaNacimiento ?? null,
          nipHash,
          estado: 'ACTIVO',
          notas: d.notas ?? null,
        }),
      );
      return this.limpiarSocio(guardado);
    } catch (e) {
      if (this.esDuplicado(e)) throw new ConflictException('Ya existe un socio con ese número o ese NIP.');
      throw e;
    }
  }

  private limpiarSocio<T extends Socio>(s: T): T {
    const { nipHash: _n, ...resto } = s as any;
    return { ...resto, tieneNip: !!_n } as T;
  }

  async actualizarSocio(id: string, tenantId: string, d: SocioInput): Promise<Socio> {
    const socio = await this.sociosRepo.findOne({ where: { id, tenantId } });
    if (!socio) throw new NotFoundException('Socio no encontrado.');
    const cambios: Partial<Socio> = {};
    if (d.nombre !== undefined) {
      const n = String(d.nombre).trim();
      if (!n) throw new BadRequestException('El socio necesita un nombre.');
      cambios.nombre = n;
    }
    for (const k of ['apellidos', 'telefono', 'email', 'fechaNacimiento', 'notas', 'branchId'] as const) {
      if (d[k] !== undefined) (cambios as any)[k] = d[k] || null;
    }
    if (d.numeroSocio !== undefined && String(d.numeroSocio).trim() !== socio.numeroSocio) {
      const n = String(d.numeroSocio).trim();
      if (!n) throw new BadRequestException('El número de socio no puede quedar vacío.');
      if (await this.sociosRepo.findOne({ where: { tenantId, numeroSocio: n } })) throw new ConflictException(`Ya existe un socio con el número ${n}.`);
      cambios.numeroSocio = n;
    }
    if (d.estado !== undefined) {
      if (d.estado !== 'ACTIVO' && d.estado !== 'BAJA') throw new BadRequestException('estado debe ser ACTIVO o BAJA.');
      cambios.estado = d.estado;
    }
    if (d.nip !== undefined) {
      if (d.nip === null || d.nip === '') {
        (cambios as any).nipHash = null;
      } else {
        if (!NIP_VALIDO.test(String(d.nip))) throw new BadRequestException('El NIP debe tener de 4 a 6 dígitos.');
        const h = hashNip(tenantId, String(d.nip));
        const otro = await this.sociosRepo.findOne({ where: { tenantId, nipHash: h } });
        if (otro && otro.id !== id) throw new ConflictException('Ese NIP ya lo usa otro socio. Elige uno distinto.');
        (cambios as any).nipHash = h;
      }
    }
    await this.sociosRepo.update(id, { ...cambios, updatedAt: new Date() } as any);
    return this.limpiarSocio((await this.sociosRepo.findOne({ where: { id, tenantId } })) as Socio);
  }

  private async periodosPorSocio(tenantId: string, socioIds?: string[]): Promise<Map<string, Membresia[]>> {
    const filas = await this.membresiasRepo.find({
      where: socioIds ? { tenantId, socioId: In(socioIds) } : { tenantId },
      order: { fechaFin: 'DESC' },
    });
    const mapa = new Map<string, Membresia[]>();
    for (const m of filas) mapa.set(m.socioId, [...(mapa.get(m.socioId) ?? []), m]);
    return mapa;
  }

  async listarSocios(tenantId: string, filtros: { q?: string; estado?: string; situacion?: string } = {}) {
    const socios = await this.sociosRepo.find({ where: { tenantId }, order: { nombre: 'ASC' } });
    const periodos = await this.periodosPorSocio(tenantId);
    const hoy = hoyLocal();
    const q = filtros.q?.trim().toLowerCase();
    return socios
      .filter((s) => !filtros.estado || s.estado === filtros.estado)
      .filter((s) => !q || `${s.numeroSocio} ${s.nombre} ${s.apellidos ?? ''} ${s.telefono ?? ''} ${s.email ?? ''}`.toLowerCase().includes(q))
      .map((s) => ({ ...this.limpiarSocio(s), situacion: situacionDeSocio(periodos.get(s.id) ?? [], hoy) }))
      .filter((s) => !filtros.situacion || s.situacion.estado === filtros.situacion);
  }

  async obtenerSocio(id: string, tenantId: string) {
    const socio = await this.sociosRepo.findOne({ where: { id, tenantId } });
    if (!socio) throw new NotFoundException('Socio no encontrado.');
    const periodos = await this.membresiasRepo.find({ where: { tenantId, socioId: id }, order: { fechaFin: 'DESC' } });
    const checkins = await this.checkinsRepo.find({ where: { tenantId, socioId: id }, order: { fechaHora: 'DESC' }, take: 20 });
    return { ...this.limpiarSocio(socio), situacion: situacionDeSocio(periodos, hoyLocal()), membresias: periodos, checkins };
  }

  // Para el POS: elegir al socio por su número y saber si su membresía está vigente y qué descuento le toca.
  async buscarPorNumero(tenantId: string, numero: string) {
    const socio = await this.sociosRepo.findOne({ where: { tenantId, numeroSocio: String(numero).trim() } });
    if (!socio) throw new NotFoundException('Socio no encontrado.');
    const periodos = await this.membresiasRepo.find({ where: { tenantId, socioId: socio.id } });
    const situacion = situacionDeSocio(periodos, hoyLocal());
    let descuentoPct = 0;
    if (situacion.estado === 'VIGENTE' && situacion.periodo?.planId) {
      const plan = await this.planesRepo.findOne({ where: { id: situacion.periodo.planId, tenantId } });
      descuentoPct = Number(plan?.beneficios?.descuentoPct) || 0;
    }
    return { id: socio.id, numeroSocio: socio.numeroSocio, nombre: socio.nombre, apellidos: socio.apellidos, estado: socio.estado, situacion, descuentoPct };
  }

  // ───────────────────────────── membresías: congelar / cancelar ─────────────────────────────
  async congelar(id: string, tenantId: string): Promise<Membresia> {
    const m = await this.membresiasRepo.findOne({ where: { id, tenantId } });
    if (!m) throw new NotFoundException('Membresía no encontrada.');
    const hoy = hoyLocal();
    if (m.estado !== 'ACTIVA' || !vigenteHoy(m, hoy)) throw new BadRequestException('Solo se puede congelar una membresía vigente.');
    const plan = m.planId ? await this.planesRepo.findOne({ where: { id: m.planId, tenantId } }) : null;
    const maximo = plan?.diasCongelacionMax ?? 0;
    if (maximo <= 0) throw new BadRequestException('El plan de esta membresía no permite congelarla.');
    if (m.diasCongelados >= maximo) throw new BadRequestException(`Ya usó los ${maximo} días de congelación de su plan.`);
    await this.membresiasRepo.update(id, { estado: 'CONGELADA', congeladaDesde: hoy, updatedAt: new Date() });
    return (await this.membresiasRepo.findOne({ where: { id, tenantId } })) as Membresia;
  }

  // Descongelar: los días en pausa se agregan al final de esta membresía (hasta el máximo del plan) y los periodos
  // programados detrás de ella se recorren los mismos días, para que no se traslapen.
  async descongelar(id: string, tenantId: string): Promise<{ membresia: Membresia; diasAcreditados: number; diasSinAcreditar: number }> {
    const m = await this.membresiasRepo.findOne({ where: { id, tenantId } });
    if (!m) throw new NotFoundException('Membresía no encontrada.');
    if (m.estado !== 'CONGELADA' || !m.congeladaDesde) throw new BadRequestException('Esta membresía no está congelada.');
    const plan = m.planId ? await this.planesRepo.findOne({ where: { id: m.planId, tenantId } }) : null;
    const permitidos = Math.max(0, (plan?.diasCongelacionMax ?? 0) - m.diasCongelados);
    const enPausa = Math.max(0, diasEntre(m.congeladaDesde, hoyLocal()));
    const acreditados = Math.min(enPausa, permitidos);
    const finViejo = m.fechaFin;
    const finNuevo = sumarDias(finViejo, acreditados);
    await this.membresiasRepo.update(id, {
      estado: 'ACTIVA', congeladaDesde: null, diasCongelados: m.diasCongelados + acreditados, fechaFin: finNuevo, updatedAt: new Date(),
    });
    if (acreditados > 0) {
      const siguientes = await this.membresiasRepo.find({ where: { tenantId, socioId: m.socioId } });
      for (const s of siguientes) {
        if (s.id !== id && s.estado !== 'CANCELADA' && s.fechaInicio > finViejo) {
          await this.membresiasRepo.update(s.id, {
            fechaInicio: sumarDias(s.fechaInicio, acreditados), fechaFin: sumarDias(s.fechaFin, acreditados), updatedAt: new Date(),
          });
        }
      }
    }
    return {
      membresia: (await this.membresiasRepo.findOne({ where: { id, tenantId } })) as Membresia,
      diasAcreditados: acreditados,
      diasSinAcreditar: enPausa - acreditados,
    };
  }

  // Cancelar sin devolución de dinero (la devolución va por el POS y cancela sola). Solo ADMIN/GERENTE (lo decide el controller).
  async cancelar(id: string, tenantId: string, motivo: string, quien?: string): Promise<Membresia> {
    const m = await this.membresiasRepo.findOne({ where: { id, tenantId } });
    if (!m) throw new NotFoundException('Membresía no encontrada.');
    if (m.estado === 'CANCELADA') throw new BadRequestException('Esta membresía ya está cancelada.');
    const motivoLimpio = String(motivo ?? '').trim();
    if (!motivoLimpio) throw new BadRequestException('El motivo es requerido.');
    await this.membresiasRepo.update(id, {
      estado: 'CANCELADA',
      notas: [m.notas, `[CANCELADA por ${quien ?? 's/d'}] ${motivoLimpio}`].filter(Boolean).join(' · '),
      updatedAt: new Date(),
    });
    return (await this.membresiasRepo.findOne({ where: { id, tenantId } })) as Membresia;
  }

  // ───────────────────────────── check-in ─────────────────────────────
  // Límite de intentos FALLIDOS (el mismo limitador del login por NIP del POS, con llaves propias para que los fallos de aquí no
  // bloqueen el login del POS): tenant + IP (10 / 15 min), tenant (40 / 15 min) y, cuando se sabe de qué socio se trata,
  // socio + IP (5) y socio (10). Un fallo es "no existe ese socio / ese NIP" o "el NIP no es de ese socio"; una membresía vencida
  // NO es un fallo (el socio es quien dice ser). Pasados los topes: 429.
  //   · solo NIP            → el NIP identifica al socio (4 a 6 dígitos: es lo que hay que proteger de la fuerza bruta)
  //   · solo número         → no es un secreto; un número que no existe cuenta como fallo (barrido de números)
  //   · número + NIP        → el NIP debe ser de ESE socio; es la forma más estricta y la recomendada en recepción con NIP
  async checkin(
    tenantId: string,
    d: { numero?: string; nip?: string },
    actor: { email?: string; id?: string; branchId?: string | null },
    ip = 'desconocida',
  ) {
    const numero = String(d?.numero ?? '').trim();
    const nip = String(d?.nip ?? '').trim();
    if (!numero && !nip) throw new BadRequestException('Indica el número de socio o el NIP.');
    if (nip && !NIP_VALIDO.test(nip)) throw new BadRequestException('El NIP debe tener de 4 a 6 dígitos.');
    const ns = `membresias:${tenantId}`; // espacio de llaves propio dentro del limitador compartido
    this.nipThrottle.assertAllowed(ns, undefined, ip);

    const metodo: 'NUMERO' | 'NIP' = numero ? 'NUMERO' : 'NIP';
    let socio: Socio | null;
    let nipVerificado = false;
    if (numero) {
      socio = await this.sociosRepo.findOne({ where: { tenantId, numeroSocio: numero } });
      if (!socio) {
        this.nipThrottle.registerFailure(ns, undefined, ip);
        return { permitido: false, motivo: 'Socio no encontrado.' };
      }
      this.nipThrottle.assertAllowed(ns, socio.id, ip);
      if (nip) {
        const h = hashNip(tenantId, nip);
        const conNip = await this.sociosRepo.findOne({ where: { tenantId, id: socio.id, nipHash: h } });
        if (!conNip) {
          this.nipThrottle.registerFailure(ns, socio.id, ip);
          return { permitido: false, motivo: 'Socio o NIP incorrectos.' }; // mismo mensaje: no revela cuál falló
        }
        nipVerificado = true;
      }
    } else {
      socio = await this.sociosRepo.findOne({ where: { tenantId, nipHash: hashNip(tenantId, nip) } });
      if (!socio) {
        this.nipThrottle.registerFailure(ns, undefined, ip);
        return { permitido: false, motivo: 'Socio no encontrado.' };
      }
      nipVerificado = true;
    }
    // Un NIP verificado limpia los contadores de ese socio en esta IP (como el login del POS); el tope por negocio no se limpia.
    if (nipVerificado) this.nipThrottle.registerSuccess(ns, socio.id, ip);

    const hoy = hoyLocal();
    const periodos = await this.membresiasRepo.find({ where: { tenantId, socioId: socio.id } });
    const sit = situacionDeSocio(periodos, hoy);
    const { diasAviso } = await this.tenantSettings.getMembresiasConfig(tenantId);

    let permitido = false;
    let motivo: string | undefined;
    let aviso: string | undefined;
    if (socio.estado !== 'ACTIVO') {
      motivo = 'El socio está dado de baja.';
    } else if (sit.estado === 'VIGENTE') {
      permitido = true;
      if ((sit.dias ?? 0) <= diasAviso) {
        aviso = sit.dias === 0 ? 'Su membresía vence hoy.' : `Su membresía vence en ${sit.dias} día(s).`;
      }
    } else if (sit.estado === 'CONGELADA') {
      motivo = 'Su membresía está congelada.';
    } else if (sit.estado === 'PROGRAMADA') {
      motivo = `Su membresía empieza el ${sit.periodo?.fechaInicio}.`;
    } else if (sit.estado === 'VENCIDA') {
      motivo = `Su membresía venció el ${sit.periodo?.fechaFin} (hace ${sit.dias} día(s)).`;
    } else {
      motivo = 'El socio no tiene membresía.';
    }

    await this.checkinsRepo.save(
      this.checkinsRepo.create({
        tenantId,
        socioId: socio.id,
        branchId: actor.branchId ?? socio.branchId ?? null,
        membresiaId: (sit.periodo as any)?.id ?? null,
        metodo,
        resultado: permitido ? 'PERMITIDO' : 'DENEGADO',
        motivo: motivo ?? null,
        registradoPor: actor.email ?? actor.id ?? null,
      }),
    );
    return {
      permitido,
      motivo,
      aviso,
      socio: { id: socio.id, numeroSocio: socio.numeroSocio, nombre: socio.nombre, apellidos: socio.apellidos },
      vigenciaHasta: sit.estado === 'VIGENTE' ? sit.periodo?.fechaFin : undefined,
      diasRestantes: sit.estado === 'VIGENTE' ? sit.dias : undefined,
    };
  }

  listarCheckins(tenantId: string, desde?: string, hasta?: string, limite = 200) {
    const d = desde ? new Date(`${desde}T00:00:00`) : new Date(Date.now() - 7 * 86_400_000);
    const h = hasta ? new Date(`${hasta}T23:59:59`) : new Date();
    return this.checkinsRepo.find({ where: { tenantId, fechaHora: Between(d, h) }, order: { fechaHora: 'DESC' }, take: Math.min(limite, 1000) });
  }

  // ───────────────────────────── alertas y reportes ─────────────────────────────
  async alertas(tenantId: string) {
    const cfg = await this.tenantSettings.getMembresiasConfig(tenantId);
    const hoy = hoyLocal();
    const socios = await this.sociosRepo.find({ where: { tenantId, estado: 'ACTIVO' } });
    const periodos = await this.periodosPorSocio(tenantId);
    const porVencer: any[] = [];
    const mora: any[] = [];
    for (const s of socios) {
      const sit = situacionDeSocio(periodos.get(s.id) ?? [], hoy);
      const base = { socioId: s.id, numeroSocio: s.numeroSocio, nombre: `${s.nombre} ${s.apellidos ?? ''}`.trim(), telefono: s.telefono, email: s.email };
      if (sit.estado === 'VIGENTE' && (sit.dias ?? 0) <= cfg.diasAviso) {
        porVencer.push({ ...base, venceEl: sit.periodo?.fechaFin, diasRestantes: sit.dias });
      } else if (sit.estado === 'VENCIDA' && (sit.dias ?? 0) > cfg.diasGracia) {
        mora.push({ ...base, vencioEl: sit.periodo?.fechaFin, diasVencida: sit.dias });
      }
    }
    porVencer.sort((a, b) => a.diasRestantes - b.diasRestantes);
    mora.sort((a, b) => b.diasVencida - a.diasVencida);
    return { hoy, diasAviso: cfg.diasAviso, diasGracia: cfg.diasGracia, porVencer, mora };
  }

  // Activas, vencidas y por vencer: conteos y, con `estado`, el listado de ese grupo.
  async reporteMembresias(tenantId: string, estado?: 'vigentes' | 'vencidas' | 'por-vencer' | 'congeladas' | 'sin-membresia') {
    const cfg = await this.tenantSettings.getMembresiasConfig(tenantId);
    const hoy = hoyLocal();
    const socios = await this.sociosRepo.find({ where: { tenantId, estado: 'ACTIVO' } });
    const periodos = await this.periodosPorSocio(tenantId);
    const conteo = { socios: socios.length, vigentes: 0, porVencer: 0, vencidas: 0, congeladas: 0, programadas: 0, sinMembresia: 0 };
    const detalle: any[] = [];
    for (const s of socios) {
      const sit = situacionDeSocio(periodos.get(s.id) ?? [], hoy);
      const porVencer = sit.estado === 'VIGENTE' && (sit.dias ?? 0) <= cfg.diasAviso;
      if (sit.estado === 'VIGENTE') conteo.vigentes++;
      if (porVencer) conteo.porVencer++;
      if (sit.estado === 'VENCIDA') conteo.vencidas++;
      if (sit.estado === 'CONGELADA') conteo.congeladas++;
      if (sit.estado === 'PROGRAMADA') conteo.programadas++;
      if (sit.estado === 'SIN_MEMBRESIA') conteo.sinMembresia++;
      const pertenece =
        (estado === 'vigentes' && sit.estado === 'VIGENTE') ||
        (estado === 'por-vencer' && porVencer) ||
        (estado === 'vencidas' && sit.estado === 'VENCIDA') ||
        (estado === 'congeladas' && sit.estado === 'CONGELADA') ||
        (estado === 'sin-membresia' && sit.estado === 'SIN_MEMBRESIA');
      if (pertenece) {
        detalle.push({
          socioId: s.id, numeroSocio: s.numeroSocio, nombre: `${s.nombre} ${s.apellidos ?? ''}`.trim(), telefono: s.telefono,
          plan: (sit.periodo as any)?.planNombre ?? null, venceEl: sit.periodo?.fechaFin ?? null, dias: sit.dias ?? null,
        });
      }
    }
    return { hoy, diasAviso: cfg.diasAviso, conteo, ...(estado ? { estado, detalle } : {}) };
  }

  // Ingresos por concepto en un rango de fechas: membresías (productos que son planes) y, para lo demás, la categoría del
  // producto (Bebidas, Servicios...). Base sin IVA, IVA y total por concepto; las devoluciones restan en la fecha en que se
  // hicieron. El descuento de cuenta y el IVA se reparten entre las líneas en proporción.
  async ingresosPorConcepto(tenantId: string, desde: string, hasta: string, sucursalId?: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || desde > hasta) {
      throw new BadRequestException('Indica desde y hasta como YYYY-MM-DD, con desde ≤ hasta.');
    }
    const planes = await this.planesRepo.find({ where: { tenantId } });
    const productosPlan = new Set(planes.map((p) => p.productId).filter((x): x is string => !!x));
    const productos = await this.productsRepo.find({ where: { tenantId }, select: ['id', 'categoryId', 'esServicio', 'name'] as any });
    const catIds = [...new Set(productos.map((p) => p.categoryId).filter((x): x is string => !!x))];
    const categorias = catIds.length ? await this.categoriesRepo.find({ where: { id: In(catIds) } }) : [];
    const nombreCategoria = new Map(categorias.map((c) => [c.id, c.name]));
    const infoProducto = new Map(productos.map((p) => [p.id, p]));

    const ventas = await this.salesRepo.find({
      where: {
        tenantId,
        status: In(['PAGADA', 'DEVUELTA', 'DEVOLUCION']),
        fecha: Between(desde as any, hasta as any),
        ...(sucursalId ? { sucursalId } : {}),
      } as any,
    });

    const conceptos = new Map<string, { base: number; impuestos: number; lineas: number }>();
    const sumar = (concepto: string, base: number, imp: number) => {
      const c = conceptos.get(concepto) ?? { base: 0, impuestos: 0, lineas: 0 };
      c.base = r2(c.base + base);
      c.impuestos = r2(c.impuestos + imp);
      c.lineas += 1;
      conceptos.set(concepto, c);
    };
    for (const v of ventas) {
      const signo = v.status === 'DEVOLUCION' ? -1 : 1;
      const items = (v.items || []).filter((it) => !it.anulado);
      if (items.length === 0) continue;
      const baseItems = items.reduce((s, it) => s + Number(it.subtotal || 0), 0);
      const impItems = items.reduce((s, it) => s + Number(it.subtotal || 0) * tasaNumerica((isValidTasaIva(it.tasaIva) ? it.tasaIva : '16') as TasaIva), 0);
      const baseVenta = Number(v.total) - Number(v.impuestos);
      const kBase = baseItems > 0 ? baseVenta / baseItems : 0;
      const kImp = impItems > 0 ? Number(v.impuestos) / impItems : 0;
      for (const it of items) {
        const baseL = Number(it.subtotal || 0);
        const impL = baseL * tasaNumerica((isValidTasaIva(it.tasaIva) ? it.tasaIva : '16') as TasaIva);
        const p = infoProducto.get(it.productoId);
        const concepto = productosPlan.has(it.productoId)
          ? 'Membresías'
          : (p?.categoryId && nombreCategoria.get(p.categoryId)) || (p?.esServicio ? 'Servicios' : 'Sin categoría');
        sumar(concepto, signo * baseL * kBase, signo * impL * kImp);
      }
    }
    const lista = [...conceptos.entries()]
      .map(([concepto, c]) => ({ concepto, base: r2(c.base), impuestos: r2(c.impuestos), total: r2(c.base + c.impuestos), lineas: c.lineas }))
      .sort((a, b) => b.total - a.total);
    const total = lista.reduce((s, c) => ({ base: r2(s.base + c.base), impuestos: r2(s.impuestos + c.impuestos), total: r2(s.total + c.total) }), { base: 0, impuestos: 0, total: 0 });
    return { desde, hasta, conceptos: lista, total };
  }
}

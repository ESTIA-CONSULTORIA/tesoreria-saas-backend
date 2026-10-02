import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Sale, SaleItem } from './entities/sale.entity';
import { Product } from './entities/product.entity';
import { Recipe } from '../costs/entities/recipe.entity';
import { Insumo } from '../costs/entities/insumo.entity';
import { InventoryMovement } from '../costs/entities/inventory-movement.entity';
import { Branch } from '../branches/entities/branch.entity';
import { TenantSetting } from '../tenant-settings/entities/tenant-setting.entity';
import { InsumoAlertsService } from './insumo-alerts.service';
import { resolveEventTimestamp } from '../common/resolve-event-timestamp.util';
import { resolveActiveInsumoChain } from '../costs/insumo-resolution';
import { NotaCocina } from './entities/nota-cocina.entity';
import { TenantSettingsService } from '../tenant-settings/tenant-settings.service';
import { AppointmentsService } from '../appointments/appointments.service';

interface LowStockInsumo {
  id: string;
  nombre: string;
  stockActual: number;
  stockMinimo: number;
}

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(Sale)
    private salesRepo: Repository<Sale>,
    @InjectRepository(Product)
    private productRepo: Repository<Product>,
    @InjectRepository(Recipe)
    private recipeRepo: Repository<Recipe>,
    @InjectRepository(Insumo)
    private insumoRepo: Repository<Insumo>,
    @InjectRepository(TenantSetting)
    private tenantSettingRepo: Repository<TenantSetting>,
    private dataSource: DataSource,
    private insumoAlertsService: InsumoAlertsService,
    // POS flexible, capacidad notas_cocina_barra: inyección de servicio normal (no un
    // algoritmo puro como resolveActiveInsumoChain, es una consulta a otra tabla) — mismo
    // patrón que AuthService ya usa con varios services de otros módulos.
    private tenantSettingsService: TenantSettingsService,
    // POS flexible, capacidad ligar_venta_a_cita: validar/completar/buscar citas reutiliza
    // AppointmentsService (misma consulta y regla de tenant del módulo de citas), no duplica
    // el acceso a la tabla "citas" desde el POS.
    private appointmentsService: AppointmentsService,
  ) {}

  // POS flexible, capacidad ligar_venta_a_cita: devuelve el citaId a persistir en la venta, o
  // null. Solo consulta la capacidad cuando el body trae citaId — una venta normal no paga
  // ninguna consulta extra y queda exactamente igual. Capacidad inactiva (o sin tenant): el
  // citaId se IGNORA, sin error, igual que un campo desconocido del body.
  private async resolveCitaId(citaId: string | undefined, tenantId?: string): Promise<string | null> {
    if (!citaId || !tenantId) return null;
    const habilitada = await this.tenantSettingsService.hasPosCapability(tenantId, 'ligar_venta_a_cita');
    if (!habilitada) return null;
    // Cita de otro tenant → NotFoundException; CANCELADA → BadRequestException.
    await this.appointmentsService.assertLinkable(citaId, tenantId);
    return citaId;
  }

  // Búsqueda de citas para elegir cuál ligar antes de cobrar (GET /pos/sales/citas).
  async buscarCitasParaLigar(tenantId: string | undefined, filters: { from?: string; to?: string; paciente?: string }) {
    if (!tenantId) {
      throw new ForbiddenException('Se requiere un tenant para consultar citas.');
    }
    if (!(await this.tenantSettingsService.hasPosCapability(tenantId, 'ligar_venta_a_cita'))) {
      throw new ForbiddenException('La capacidad ligar_venta_a_cita no está activa para este negocio.');
    }
    const from = filters.from ? new Date(filters.from) : undefined;
    const to = filters.to ? new Date(filters.to) : undefined;
    if ((from && isNaN(from.getTime())) || (to && isNaN(to.getTime()))) {
      throw new BadRequestException('from/to inválidos');
    }
    return this.appointmentsService.searchForPos(tenantId, { from, to, paciente: filters.paciente });
  }

  async generateFolio(): Promise<string> {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.salesRepo
      .createQueryBuilder('sale')
      .where('sale.folio LIKE :prefix', { prefix: `VTA-${today}%` })
      .getCount();
    const nextNumber = (count + 1).toString().padStart(3, '0');
    return `VTA-${today}-${nextNumber}`;
  }

  // Opcional para no romper a quien llega sin tenantId (mismo criterio que el resto del POS:
  // sin tenant no se filtra).
  private productWhere(id: string, tenantId?: string) {
    return tenantId ? { id, tenantId } : { id };
  }

  // Un id que no existe en absoluto conserva el comportamiento de siempre (las ramas de
  // inventario lo ignoran); lo que se rechaza es un producto que SÍ existe pero no es de este
  // tenant (de otro, o huérfano). Mensaje igual al de "no existe" para no revelar a qué
  // tenant pertenece.
  private async assertProductsBelongToTenant(items: SaleItem[], tenantId?: string): Promise<void> {
    if (!tenantId) return;
    for (const item of items) {
      const owned = await this.productRepo.findOne({ where: { id: item.productoId, tenantId } });
      if (owned) continue;
      const existsElsewhere = await this.productRepo.findOne({ where: { id: item.productoId } });
      if (existsElsewhere) {
        throw new BadRequestException(`Producto no encontrado: ${item.productoId}`);
      }
    }
  }

  private async calculateCostoReal(items: SaleItem[], tenantId: string, ventaServicioHabilitada: boolean): Promise<number> {
    let total = 0;
    for (const item of items) {
      const product = await this.productRepo.findOne({ where: this.productWhere(item.productoId, tenantId) });
      if (!product) continue;
      // POS flexible, capacidad venta_de_servicio: un servicio nunca contribuye a
      // costoReal, sin importar si por error quedó con recipeId/insumoId vinculado — el
      // chequeo va ANTES de las ramas de type, no depende de que además le falten esos
      // campos.
      if (product.esServicio && ventaServicioHabilitada) continue;
      if (product.type === 'PREPARADO' && product.recipeId) {
        const recipe = await this.recipeRepo.findOne({ where: { id: product.recipeId } });
        if (recipe?.items) {
          for (const ri of recipe.items) {
            const crudo = await this.insumoRepo.findOne({ where: { id: ri.insumoId } });
            // Punto 2 (GoodsHabits): mismo motivo que deductInsumo() — si el insumo de la
            // receta ya fue reemplazado, el costoReal de la venta debe reflejar el costo
            // del insumo vigente, no el descontinuado (quedaría inconsistente con lo que
            // deductInsumo() realmente descuenta más abajo si no se resuelve acá también).
            const insumo = crudo ? await this.resolveActiveInsumo(crudo) : null;
            if (insumo) total += Number(insumo.costoUnitario) * ri.cantidad * item.cantidad;
          }
        }
      } else if (product.type === 'SIMPLE' && product.insumoId) {
        const crudo = await this.insumoRepo.findOne({ where: { id: product.insumoId } });
        const insumo = crudo ? await this.resolveActiveInsumo(crudo) : null;
        if (insumo) total += Number(insumo.costoUnitario) * item.cantidad;
      }
    }
    return Math.round(total * 100) / 100;
  }

  async create(data: {
    items: SaleItem[];
    subtotal: number;
    descuento: number;
    impuestos: number;
    total: number;
    formaPago?: string;
    formasPago?: any[];
    cajero: string;
    turnoId: string;
    sucursalId: string;
    tenantId: string;
    notas?: string;
    referencia?: string;
    tableId?: string;
    clientTimestamp?: string;
    citaId?: string; // POS flexible, capacidad ligar_venta_a_cita (se ignora si la capacidad está inactiva)
    folio?: string; // generado en el cliente (Fase A1, modo offline). Si no viene,
                     // se genera server-side como siempre — retrocompatible.
  }) {
    const folio = data.folio || await this.generateFolio();
    // Fuera del try (más abajo): un clientTimestamp inválido debe llegar al cliente como
    // 400 (BadRequestException), no enmascararse como 500 por el catch genérico de la venta.
    const now = resolveEventTimestamp(data.clientTimestamp);

    // Aislamiento por tenant: antes los productos se buscaban solo por id, así que una venta
    // podía incluir (y descontar inventario de) un producto de OTRO tenant, o uno huérfano
    // sin tenantId, conociendo su UUID. Se rechaza ANTES de calcular nada.
    await this.assertProductsBelongToTenant(data.items, data.tenantId);

    // POS flexible, capacidad ligar_venta_a_cita: validado ANTES de abrir la transacción
    // (cita ajena/cancelada → rechazo sin tocar la BD).
    const citaId = await this.resolveCitaId(data.citaId, data.tenantId);

    // POS flexible, capacidad venta_de_servicio: se resuelve una sola vez, antes de
    // calculateCostoReal()/checkStockAvailability()/deductInventory() — las tres ramas que
    // deciden si un ítem descuenta inventario necesitan la misma respuesta, no vale la pena
    // preguntar la capacidad por ítem.
    const ventaServicioHabilitada = await this.tenantSettingsService.hasPosCapability(
      data.tenantId,
      'venta_de_servicio',
    );

    const costoReal = await this.calculateCostoReal(data.items, data.tenantId, ventaServicioHabilitada);

    // Auditoría de producto (GoodsHabits, Punto 1): chequeo de disponibilidad ANTES de
    // abrir la transacción — si el tenant tiene stockPolicy BLOQUEAR y algo no alcanza,
    // la venta se rechaza con detalle claro de qué falta, sin tocar la BD. Bajo
    // PERMITIR_NEGATIVO (default) es un no-op inmediato.
    await this.checkStockAvailability(data.items, data.tenantId, ventaServicioHabilitada);

    // POS flexible, capacidad notas_cocina_barra: se resuelve ANTES de abrir la
    // transacción (mismo criterio que checkStockAvailability arriba) — un solo query de
    // capacidad por venta, no uno por ítem dentro de la transacción.
    const notasCocinaHabilitada = await this.tenantSettingsService.hasPosCapability(
      data.tenantId,
      'notas_cocina_barra',
    );

    let savedSale: Sale;
    let lowStockInsumos: LowStockInsumo[] = [];

    try {
      // Venta + descuento de inventario en una sola transacción: si cualquier parte
      // falla, TypeORM hace rollback de todo (ni la venta ni el inventario quedan a
      // medias) y relanza el error, que se captura abajo.
      savedSale = await this.dataSource.transaction(async (manager) => {
        const sale = manager.create(Sale, {
          folio,
          fecha: now,
          hora: now.toTimeString().slice(0, 8),
          items: data.items,
          subtotal: data.subtotal,
          descuento: data.descuento,
          impuestos: data.impuestos,
          total: data.total,
          formaPago: (data.formaPago || data.formasPago?.[0]?.forma) as any,
          formasPago: data.formasPago || [],
          // Mark as PAGADA immediately when payment forms are included
          status: (data.formasPago && data.formasPago.length > 0) ? 'PAGADA' : 'ABIERTA',
          cajero: data.cajero,
          turnoId: data.turnoId,
          sucursalId: data.sucursalId,
          tenantId: data.tenantId,
          notas: data.notas || '',
          referencia: data.referencia || '',
          tableId: data.tableId || null,
          citaId,
          costoReal,
        });

        const saved = await manager.save(sale);

        // POS flexible, capacidad ligar_venta_a_cita: una venta que nace PAGADA completa la
        // cita en la MISMA transacción (si se revierte, la cita no cambia). Una venta ABIERTA
        // la completará pay() al cobrarse.
        if (citaId && saved.status === 'PAGADA') {
          await this.appointmentsService.completarPorVenta(citaId, data.tenantId, manager);
        }

        // Deduct inventory for each product sold; junta los insumos que quedaron en
        // stock bajo para generar sus alertas DESPUÉS de confirmar la venta (abajo).
        lowStockInsumos = await this.deductInventory(manager, data.items, folio, data.tenantId, data.sucursalId, ventaServicioHabilitada);

        // POS flexible, capacidad notas_cocina_barra: paso adicional dentro de la MISMA
        // transacción de la venta (no un servicio paralelo) — si la venta se revierte, las
        // notas generadas se revierten con ella.
        if (notasCocinaHabilitada) {
          await this.generateNotasCocina(manager, data.items, saved.id, data.tenantId, data.sucursalId);
        }

        return saved;
      });
    } catch (error) {
      // Colisión de folio (23505 = unique_violation de Postgres): error específico y
      // claro, NO el mensaje genérico de "intenta de nuevo" — un folio duplicado
      // (generado en el cliente, Fase A1) fallaría exactamente igual en cada reintento
      // con el mismo folio; el cajero necesita una señal distinta a un fallo transitorio.
      // BadRequestException (HttpException real) para que llegue como 400 al cliente,
      // no enmascarado como 500 — mismo cuidado que con clientTimestamp más arriba.
      if ((error as any)?.code === '23505') {
        console.error(`SalesService.create: folio duplicado (folio ${folio}):`, error);
        throw new BadRequestException(`El folio '${folio}' ya existe, no se pudo registrar la venta.`);
      }
      // Detalle técnico completo al log (para soporte/diagnóstico), mensaje genérico
      // y accionable al cajero: la causa más probable es momentánea (red, timeout) y
      // un reintento inmediato del mismo cobro debería funcionar.
      console.error(`SalesService.create error (folio ${folio}, rollback aplicado, nada quedó guardado):`, error);
      throw new Error('No se pudo procesar la venta, intenta de nuevo.');
    }

    // Alertas de stock bajo: best-effort, fuera de la transacción de la venta. La venta
    // ya está confirmada y cobrada; un fallo aquí no debe afectarla en absoluto.
    if (lowStockInsumos.length > 0) {
      await this.reportLowStockAlerts(lowStockInsumos, data, folio);
    }

    return savedSale;
  }

  private async reportLowStockAlerts(
    insumos: LowStockInsumo[],
    data: { sucursalId: string; tenantId: string; cajero: string },
    folio: string,
  ) {
    let companyId: string | undefined;
    try {
      // Insumo/Product/Sale no tienen companyId propio — se resuelve vía la sucursal,
      // que sí lo tiene (Branch.companyId), sin necesitar ningún cambio de esquema.
      const branch = await this.dataSource.getRepository(Branch).findOne({ where: { id: data.sucursalId } });
      companyId = branch?.companyId;
    } catch (error) {
      console.error(`SalesService: error al resolver companyId desde sucursalId ${data.sucursalId} para alertas de stock (folio ${folio}):`, error);
    }

    if (!companyId) {
      console.error(`SalesService: companyId no encontrado para sucursalId ${data.sucursalId}, se omiten alertas de stock bajo (folio ${folio})`);
      return;
    }

    for (const insumo of insumos) {
      try {
        const estado = insumo.stockActual <= 0 ? 'agotado' : 'proximo';
        await this.insumoAlertsService.upsert(data.tenantId, companyId, data.cajero, {
          insumoId: insumo.id,
          nombre: insumo.nombre,
          tipo: 'insumo',
          estado,
          notas: `Auto-generada por venta ${folio}: stock actual ${insumo.stockActual} (mínimo ${insumo.stockMinimo}).`,
        });
      } catch (error) {
        console.error(`SalesService: no se pudo crear/actualizar alerta de stock bajo para insumo ${insumo.nombre} (${insumo.id}), venta ${folio}:`, error);
      }
    }
  }

  // Auditoría de producto (GoodsHabits, Punto 1): agrega la cantidad total requerida POR
  // insumo YA RESUELTO (ver resolveActiveInsumo) a través de todo el carrito — dos
  // productos del mismo ticket pueden compartir insumo, y si uno apunta a un insumo ya
  // reemplazado, el chequeo debe hacerse contra el insumo vigente, no el descontinuado
  // (mismo criterio que aplicará deductInsumo() al momento real de descontar).
  private async checkStockAvailability(items: SaleItem[], tenantId: string, ventaServicioHabilitada: boolean): Promise<void> {
    const setting = await this.tenantSettingRepo.findOne({ where: { tenantId } });
    if ((setting?.stockPolicy || 'PERMITIR_NEGATIVO') !== 'BLOQUEAR') return;

    const neededByInsumo = new Map<string, { nombre: string; cantidad: number }>();

    const acumular = async (rawInsumoId: string, cantidad: number) => {
      const crudo = await this.insumoRepo.findOne({ where: { id: rawInsumoId } });
      if (!crudo) return;
      const resuelto = await this.resolveActiveInsumo(crudo);
      const actual = neededByInsumo.get(resuelto.id);
      neededByInsumo.set(resuelto.id, {
        nombre: resuelto.nombre,
        cantidad: (actual?.cantidad || 0) + cantidad,
      });
    };

    for (const item of items) {
      const product = await this.productRepo.findOne({ where: this.productWhere(item.productoId, tenantId) });
      if (!product) continue;

      // POS flexible, capacidad venta_de_servicio: un servicio nunca exige stock
      // disponible, sin importar si por error quedó con recipeId/insumoId vinculado.
      if (product.esServicio && ventaServicioHabilitada) continue;

      if (product.type === 'PREPARADO' && product.recipeId) {
        const recipe = await this.recipeRepo.findOne({ where: { id: product.recipeId } });
        if (!recipe?.items) continue;
        for (const ri of recipe.items) {
          await acumular(ri.insumoId, ri.cantidad * item.cantidad);
        }
      } else if (product.type === 'SIMPLE' && product.insumoId) {
        await acumular(product.insumoId, item.cantidad);
      }
    }

    const faltantes: { insumo: string; disponible: number; requerido: number }[] = [];
    for (const [insumoId, { nombre, cantidad }] of neededByInsumo) {
      const insumo = await this.insumoRepo.findOne({ where: { id: insumoId } });
      if (!insumo) continue;
      const disponible = Number(insumo.stockActual);
      if (disponible < cantidad) {
        faltantes.push({ insumo: nombre, disponible, requerido: cantidad });
      }
    }

    if (faltantes.length > 0) {
      throw new BadRequestException({
        message: 'Stock insuficiente para completar la venta',
        faltantes,
      });
    }
  }

  // Ronda de seguimiento (arquitectura): la caminata de reemplazadoPorId se unificó en
  // insumo-resolution.ts (compartida con costs.service.ts/products.service.ts) — este método
  // solo traduce el resultado al contrato de error que ya tenía (Error en ciclo,
  // BadRequestException en los otros dos casos, mismos mensajes exactos — venta real, el
  // cajero necesita un 400 claro). `manager` sigue siendo opcional: se pasa el manager
  // transaccional activo cuando se llama desde dentro de la transacción (deductInsumo), se
  // omite en el chequeo previo (checkStockAvailability, que corre ANTES de abrir la
  // transacción) — ahí se usa this.insumoRepo.manager (no-transaccional, equivalente exacto a
  // this.insumoRepo.findOne() de antes).
  private async resolveActiveInsumo(
    insumo: Insumo,
    manager?: EntityManager,
    visitados: Set<string> = new Set(),
  ): Promise<Insumo> {
    const resultado = await resolveActiveInsumoChain(manager ?? this.insumoRepo.manager, insumo, visitados);
    if (resultado.ok) {
      return resultado.insumo;
    }
    if (resultado.reason === 'CYCLE') {
      throw new Error(`Referencia circular en la cadena de reemplazo del insumo ${resultado.insumoId}`);
    }
    if (resultado.reason === 'NO_REPLACEMENT') {
      throw new BadRequestException(`El insumo "${resultado.nombre}" está inactivo y no tiene reemplazo configurado — no se puede vender.`);
    }
    throw new BadRequestException(`El insumo de reemplazo de "${resultado.nombre}" no existe.`);
  }

  private async deductInventory(manager: EntityManager, items: SaleItem[], folio: string, tenantId: string, sucursalId: string, ventaServicioHabilitada: boolean): Promise<LowStockInsumo[]> {
    const lowStock: LowStockInsumo[] = [];
    for (const item of items) {
      const product = await manager.findOne(Product, { where: this.productWhere(item.productoId, tenantId) });
      if (!product) continue;

      // POS flexible, capacidad venta_de_servicio: un servicio nunca descuenta inventario,
      // sin importar si por error quedó con recipeId/insumoId vinculado — el chequeo va
      // ANTES de las ramas de type, no depende de que además le falten esos campos. Con la
      // capacidad INACTIVA (ventaServicioHabilitada=false), este `continue` nunca se toma
      // — un producto marcado esServicio=true cae directo a las ramas de abajo y se
      // comporta como un producto normal (si además tiene insumoId, SÍ descuenta).
      if (product.esServicio && ventaServicioHabilitada) continue;

      if (product.type === 'PREPARADO' && product.recipeId) {
        // Deduct recipe ingredients
        lowStock.push(...await this.deductRecipeIngredients(manager, product.recipeId, item.cantidad, folio, tenantId, sucursalId));
      } else if (product.type === 'SIMPLE' && product.insumoId) {
        // Deduct single insumo
        const result = await this.deductInsumo(manager, product.insumoId, item.cantidad, folio, tenantId, sucursalId);
        if (result) lowStock.push(result);
      }
    }
    return lowStock;
  }

  private async deductRecipeIngredients(manager: EntityManager, recipeId: string, quantity: number, folio: string, tenantId: string, sucursalId: string): Promise<LowStockInsumo[]> {
    const recipe = await manager.findOne(Recipe, { where: { id: recipeId } });
    const lowStock: LowStockInsumo[] = [];
    if (!recipe || !recipe.items) return lowStock;

    for (const item of recipe.items) {
      const result = await this.deductInsumo(manager, item.insumoId, item.cantidad * quantity, folio, tenantId, sucursalId);
      if (result) lowStock.push(result);
    }
    return lowStock;
  }

  private async deductInsumo(manager: EntityManager, insumoId: string, quantity: number, folio: string, tenantId: string, sucursalId: string): Promise<LowStockInsumo | null> {
    const insumoCrudo = await manager.findOne(Insumo, { where: { id: insumoId } });
    if (!insumoCrudo) return null;
    // Punto 2: resuelve la cadena de reemplazo — si insumoId apunta a un insumo ya
    // reemplazado, descuenta del insumo vigente, no del descontinuado.
    const insumo = await this.resolveActiveInsumo(insumoCrudo, manager);

    // Punto 1: antes clampaba a 0 con Math.max(0, ...) — le mentía al ledger auditable
    // (InventoryMovement.stockResultante) sobre el déficit real. checkStockAvailability()
    // ya rechazó la venta más arriba si el tenant tiene stockPolicy BLOQUEAR y esto no
    // alcanzaba; si llegamos hasta acá, o el tenant permite negativo, o alcanzaba de
    // sobra — en ambos casos la resta debe ser honesta, no clampada.
    const newStock = Number(insumo.stockActual) - quantity;
    await manager.update(Insumo, insumo.id, { stockActual: newStock });

    // Ledger auditable del movimiento — misma transacción que el descuento de stock,
    // a diferencia de las alertas de stock bajo (esas sí son best-effort y van aparte).
    const movement = manager.create(InventoryMovement, {
      insumoId: insumo.id,
      tenantId,
      tipo: 'SALIDA_VENTA',
      cantidad: quantity,
      stockResultante: newStock,
      costoUnitario: Number(insumo.costoUnitario),
      referencia: folio,
      sucursalId,
    });
    await manager.save(movement);

    const stockMinimo = Number(insumo.stockMinimo);
    if (newStock <= stockMinimo) {
      return { id: insumo.id, nombre: insumo.nombre, stockActual: newStock, stockMinimo };
    }
    return null;
  }

  // POS flexible, capacidad notas_cocina_barra: una NotaCocina por ÍTEM cuyo producto tenga
  // estacionPreparacion asignada (no todos los ítems de la venta, solo los que van a
  // cocina/barra — ver Product.estacionPreparacion). estacion se copia del producto en este
  // momento, no queda como referencia viva: si el producto cambia de estación después, esta
  // nota ya generada conserva la estación con la que se creó.
  private async generateNotasCocina(
    manager: EntityManager,
    items: SaleItem[],
    saleId: string,
    tenantId: string,
    sucursalId: string,
  ): Promise<void> {
    for (const item of items) {
      const product = await manager.findOne(Product, { where: this.productWhere(item.productoId, tenantId) });
      if (!product || !product.estacionPreparacion) continue;

      const nota = manager.create(NotaCocina, {
        tenantId,
        sucursalId,
        saleId,
        productoId: product.id,
        nombre: product.name,
        cantidad: item.cantidad,
        estacion: product.estacionPreparacion,
        estado: 'PENDIENTE',
      });
      await manager.save(nota);
    }
  }

  async findAll(filters?: {
    status?: string;
    cajero?: string;
    turnoId?: string;
    sucursalId?: string;
    tenantId?: string;
    fechaInicio?: Date;
    fechaFin?: Date;
  }) {
    try {
      const query = this.salesRepo.createQueryBuilder('sale');

      if (filters?.status) {
        query.andWhere('sale.status = :status', { status: filters.status });
      }
      if (filters?.cajero) {
        query.andWhere('sale.cajero = :cajero', { cajero: filters.cajero });
      }
      if (filters?.turnoId) {
        query.andWhere('sale.turnoId = :turnoId', { turnoId: filters.turnoId });
      }
      if (filters?.sucursalId) {
        query.andWhere('sale.sucursalId = :sucursalId', { sucursalId: filters.sucursalId });
      }
      if (filters?.tenantId) {
        query.andWhere('sale.tenantId = :tenantId', { tenantId: filters.tenantId });
      }
      if (filters?.fechaInicio) {
        query.andWhere('sale.fecha >= :fechaInicio', { fechaInicio: filters.fechaInicio });
      }
      if (filters?.fechaFin) {
        query.andWhere('sale.fecha <= :fechaFin', { fechaFin: filters.fechaFin });
      }

      return query.orderBy('sale.createdAt', 'DESC').getMany();
    } catch (error) {
      console.error('SalesService.findAll error:', error);
      throw new Error(`Error al obtener ventas: ${error.message}`);
    }
  }

  // Auditoría BUSINESS (hallazgo transversal #6): findOne()/pay()/cancel()/applyDiscount()/
  // returnSale() no verificaban que la venta perteneciera al tenant de quien llama — Sale sí
  // tiene tenantId propio, así que basta con sumarlo al where. Se reutiliza el mismo mensaje
  // "Venta no encontrada" que ya usa el catch de cada método (no un 403 nuevo) para no
  // revelar si el id existe en otro tenant y para no romper el formato de error existente.
  async findOne(id: string, tenantId?: string) {
    try {
      return this.salesRepo.findOne({ where: tenantId ? { id, tenantId } : { id } });
    } catch (error) {
      console.error('SalesService.findOne error:', error);
      throw new Error(`Error al obtener venta: ${error.message}`);
    }
  }

  async pay(id: string, data: {
    formaPago: string;
    montoRecibido: number;
    cambio: number;
  }, tenantId?: string) {
    try {
      const sale = await this.salesRepo.findOne({ where: tenantId ? { id, tenantId } : { id } });
      if (!sale) {
        throw new Error('Venta no encontrada');
      }
      if (sale.status !== 'ABIERTA') {
        throw new Error('La venta ya no está abierta');
      }

      const cambiosPago = {
        formaPago: data.formaPago as any,
        montoRecibido: data.montoRecibido,
        cambio: data.cambio,
        status: 'PAGADA' as const,
      };

      if (sale.citaId && sale.tenantId) {
        // Venta ligada a una cita (capacidad ligar_venta_a_cita, validada al crearla): el
        // cobro y la transición de la cita a COMPLETADA van en la misma transacción.
        await this.dataSource.transaction(async (manager) => {
          await manager.update(Sale, id, cambiosPago);
          await this.appointmentsService.completarPorVenta(sale.citaId as string, sale.tenantId, manager);
        });
      } else {
        await this.salesRepo.update(id, cambiosPago);
      }

      return this.salesRepo.findOne({ where: { id } });
    } catch (error) {
      console.error('SalesService.pay error:', error);
      throw new Error(`Error al procesar pago: ${error.message}`);
    }
  }

  async cancel(id: string, motivo: string, tenantId?: string) {
    try {
      const sale = await this.salesRepo.findOne({ where: tenantId ? { id, tenantId } : { id } });
      if (!sale) {
        throw new Error('Venta no encontrada');
      }
      if (sale.status === 'CANCELADA') {
        throw new Error('La venta ya está cancelada');
      }

      await this.salesRepo.update(id, {
        status: 'CANCELADA',
        motivoCancelacion: motivo,
      });

      return this.salesRepo.findOne({ where: { id } });
    } catch (error) {
      console.error('SalesService.cancel error:', error);
      throw new Error(`Error al cancelar venta: ${error.message}`);
    }
  }

  async applyDiscount(id: string, descuento: number, nuevoTotal: number, tenantId?: string) {
    try {
      const sale = await this.salesRepo.findOne({ where: tenantId ? { id, tenantId } : { id } });
      if (!sale) {
        throw new Error('Venta no encontrada');
      }
      if (sale.status !== 'ABIERTA') {
        throw new Error('Solo se puede aplicar descuento a ventas abiertas');
      }

      await this.salesRepo.update(id, {
        descuento,
        total: nuevoTotal,
      });

      return this.salesRepo.findOne({ where: { id } });
    } catch (error) {
      console.error('SalesService.applyDiscount error:', error);
      throw new Error(`Error al aplicar descuento: ${error.message}`);
    }
  }

  async returnSale(id: string, data: {
    items: SaleItem[];
    motivo: string;
    montoDevolucion: number;
  }, tenantId?: string) {
    try {
      const sale = await this.salesRepo.findOne({ where: tenantId ? { id, tenantId } : { id } });
      if (!sale) {
        throw new Error('Venta no encontrada');
      }
      if (sale.status !== 'PAGADA') {
        throw new Error('Solo se puede devolver ventas pagadas');
      }

      // Create a new return sale record
      const folio = await this.generateFolio();
      const now = new Date();
      const returnSale = this.salesRepo.create({
        folio: `${folio}-DEV`,
        fecha: now,
        hora: now.toTimeString().slice(0, 8),
        items: data.items,
        subtotal: -data.montoDevolucion,
        descuento: 0,
        impuestos: 0,
        total: -data.montoDevolucion,
        formaPago: 'CORTESIA',
        status: 'PAGADA',
        cajero: sale.cajero,
        turnoId: sale.turnoId,
        sucursalId: sale.sucursalId,
        tenantId: sale.tenantId,
        notas: `Devolución de venta ${sale.folio}. Motivo: ${data.motivo}`,
        referencia: sale.folio,
      });

      return this.salesRepo.save(returnSale);
    } catch (error) {
      console.error('SalesService.returnSale error:', error);
      throw new Error(`Error al procesar devolución: ${error.message}`);
    }
  }
}

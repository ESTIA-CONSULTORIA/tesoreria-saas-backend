import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Not, Repository } from 'typeorm';
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
import { Shift } from './entities/shift.entity';
import { PoliticaDevolucion, ROLES_GERENTE } from '../config/politica-devoluciones.config';

// Quien ejecuta una operación (req.user del JWT): id, email y roleCode.
type Actor = { id?: string; email?: string; roleCode?: string };
import { Table } from './entities/table.entity';
import { TenantSettingsService } from '../tenant-settings/tenant-settings.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { CostsService } from '../costs/costs.service';
import { JustifiableCategory } from '../costs/entities/justifiable.entity';

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
    // POS flexible, capacidad mesas_cuenta_abierta: mermas de cuentas canceladas por la vía de
    // Costos (Justifiable MERMAS_FALTANTES), no una tabla de mermas propia del POS.
    private costsService: CostsService,
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
    // notaCocinaId/anulado son marcas del servidor (cancelación de cuentas abiertas): lo que
    // venga del cliente se descarta para que nadie pueda simular "ya salió a cocina".
    data = { ...data, items: (data.items || []).map(({ notaCocinaId: _n, anulado: _a, ...resto }: any) => resto) };
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

    // POS flexible, capacidad mesas_cuenta_abierta: con la capacidad activa y un tableId, la
    // venta que nace ABIERTA (sin formasPago) es una cuenta abierta ligada a esa mesa. Se valida
    // ANTES de la transacción (mesa inexistente/ajena → 404 claro, no un 500 genérico).
    const nacePagada = !!(data.formasPago && data.formasPago.length > 0);
    const abreCuentaEnMesa = !nacePagada && (await this.resolveMesaParaCuentaAbierta(data.tableId, data.tenantId));

    let savedSale: Sale;
    let lowStockInsumos: LowStockInsumo[] = [];

    try {
      // Venta + descuento de inventario en una sola transacción: si cualquier parte
      // falla, TypeORM hace rollback de todo (ni la venta ni el inventario quedan a
      // medias) y relanza el error, que se captura abajo.
      savedSale = await this.dataSource.transaction(async (manager) => {
        // Una sola cuenta abierta por mesa. El lock de la fila de la mesa serializa dos
        // aperturas simultáneas sobre la misma mesa: la segunda espera, ve la cuenta de la
        // primera y recibe el 409 (ConflictException, el único error que create() deja pasar).
        if (abreCuentaEnMesa) {
          const mesa = await manager.findOne(Table, {
            where: { id: data.tableId as string, tenantId: data.tenantId },
            lock: { mode: 'pessimistic_write' },
          });
          const otraCuenta = await manager.findOne(Sale, {
            where: { tenantId: data.tenantId, tableId: data.tableId as string, status: 'ABIERTA' },
          });
          if (otraCuenta) {
            throw new ConflictException(
              `La mesa ${mesa?.number ?? ''} ya tiene una cuenta abierta (folio ${otraCuenta.folio}).`,
            );
          }
        }

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

        // Mesa ocupada en la MISMA transacción: si la venta se revierte, la mesa no cambia.
        if (abreCuentaEnMesa) {
          await manager.update(Table, data.tableId as string, { status: 'OCCUPIED', updatedAt: new Date() });
        }

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
          const notaIds = await this.generateNotasCocina(manager, data.items, saved.id, data.tenantId, data.sucursalId);
          if (notaIds.some(Boolean)) {
            // Marca cada ítem que salió a cocina/barra (ver SaleItem.notaCocinaId): al cancelar la
            // cuenta o quitar el ítem, esos NO devuelven stock y se registran como merma.
            const marcados = data.items.map((it, i) => (notaIds[i] ? { ...it, notaCocinaId: notaIds[i] as string } : it));
            await manager.update(Sale, saved.id, { items: marcados });
            saved.items = marcados;
          }
        }

        return saved;
      });
    } catch (error) {
      // 409 de cuenta abierta (mesa ya ocupada por otra cuenta): llega tal cual al cliente.
      if (error instanceof ConflictException) {
        throw error;
      }
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
  ): Promise<Array<string | null>> {
    const ids: Array<string | null> = [];
    for (const item of items) {
      const product = await manager.findOne(Product, { where: this.productWhere(item.productoId, tenantId) });
      if (!product || !product.estacionPreparacion) {
        ids.push(null);
        continue;
      }

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
      const guardada = await manager.save(nota);
      ids.push(guardada?.id ?? null);
    }
    return ids;
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

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // POS flexible, capacidad mesas_cuenta_abierta. NO es un camino paralelo: una cuenta abierta ES
  // una Sale con status ABIERTA y tableId (ya existían). Agregar ítems reutiliza las mismas
  // ramas de inventario/costo/notas que create() (deductInventory, checkStockAvailability,
  // calculateCostoReal, generateNotasCocina — y con ellas venta_de_servicio y
  // notas_cocina_barra), y cobrar reutiliza formasPago + el cierre PAGADA de siempre (y con él
  // la transición de la cita de ligar_venta_a_cita). Todo en transacciones con lock sobre la
  // fila de la venta, porque aquí dos cajeros pueden tocar la misma cuenta a la vez (agregar un
  // ítem mientras otro cobra una parte): sin lock el saldo se calcularía sobre datos viejos.
  // ───────────────────────────────────────────────────────────────────────────────────────────

  private round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  private sumPagos(formasPago?: Sale['formasPago'] | null): number {
    const pagos = Array.isArray(formasPago) ? formasPago : [];
    return this.round2(pagos.reduce((sum, fp) => sum + (Number(fp?.monto) || 0), 0));
  }

  // Con la capacidad activa y un tableId: la mesa debe existir en el tenant y estar activa.
  // Devuelve false (comportamiento de siempre: tableId se guarda sin más) si no aplica.
  private async resolveMesaParaCuentaAbierta(tableId?: string, tenantId?: string): Promise<boolean> {
    if (!tableId || !tenantId) return false;
    if (!(await this.tenantSettingsService.hasPosCapability(tenantId, 'mesas_cuenta_abierta'))) return false;
    const mesa = await this.dataSource.getRepository(Table).findOne({ where: { id: tableId, tenantId } });
    if (!mesa || !mesa.isActive) {
      throw new NotFoundException('Mesa no encontrada');
    }
    return true;
  }

  private async assertCuentasAbiertasHabilitada(tenantId?: string): Promise<string> {
    if (!tenantId) {
      throw new ForbiddenException('Se requiere un tenant para operar cuentas abiertas.');
    }
    if (!(await this.tenantSettingsService.hasPosCapability(tenantId, 'mesas_cuenta_abierta'))) {
      throw new ForbiddenException('La capacidad mesas_cuenta_abierta no está activa para este negocio.');
    }
    return tenantId;
  }

  // Cierra/cancela la cuenta → la mesa vuelve a AVAILABLE (solo si seguía OCCUPIED, no pisa un
  // estado puesto a mano como RESERVED/DIRTY). Misma transacción que el cierre.
  private async liberarMesa(manager: EntityManager, sale: { tableId: string | null; tenantId: string }) {
    if (!sale.tableId || !sale.tenantId) return;
    await manager.update(Table, { id: sale.tableId, tenantId: sale.tenantId, status: 'OCCUPIED' }, {
      status: 'AVAILABLE',
      updatedAt: new Date(),
    });
  }

  // ── Devolución de stock y merma de una cuenta abierta ───────────────────────────────────────
  // Espejo de deductInventory()/deductRecipeIngredients()/deductInsumo(): mismas ramas (recetas,
  // insumo simple, venta_de_servicio), misma resolución de la cadena de reemplazo de insumos
  // (resolveActiveInsumo) y el mismo ledger auditable (InventoryMovement) — la devolución pasa por
  // la cadena real de Costos, no por una lógica de inventario propia del POS. Siempre con el
  // EntityManager de la transacción de quien llama (cancelar la cuenta / quitar el ítem).
  private async restoreInventory(
    manager: EntityManager,
    items: SaleItem[],
    folio: string,
    tenantId: string,
    sucursalId: string,
    ventaServicioHabilitada: boolean,
    tipoMovimiento = 'ENTRADA_CANCELACION',
  ): Promise<void> {
    for (const item of items) {
      const product = await manager.findOne(Product, { where: this.productWhere(item.productoId, tenantId) });
      if (!product) continue;
      // Mismo criterio que deductInventory(): un servicio nunca descontó inventario, así que no
      // hay nada que devolver.
      if (product.esServicio && ventaServicioHabilitada) continue;

      if (product.type === 'PREPARADO' && product.recipeId) {
        const recipe = await manager.findOne(Recipe, { where: { id: product.recipeId } });
        if (!recipe || !recipe.items) continue;
        for (const ri of recipe.items) {
          await this.restoreInsumo(manager, ri.insumoId, ri.cantidad * item.cantidad, folio, tenantId, sucursalId, tipoMovimiento);
        }
      } else if (product.type === 'SIMPLE' && product.insumoId) {
        await this.restoreInsumo(manager, product.insumoId, item.cantidad, folio, tenantId, sucursalId, tipoMovimiento);
      }
    }
  }

  private async restoreInsumo(
    manager: EntityManager,
    insumoId: string,
    quantity: number,
    folio: string,
    tenantId: string,
    sucursalId: string,
    tipoMovimiento = 'ENTRADA_CANCELACION',
  ): Promise<void> {
    const insumoCrudo = await manager.findOne(Insumo, { where: { id: insumoId } });
    if (!insumoCrudo) return;
    // Cadena de reemplazo: el stock vuelve al insumo vigente. Si la cadena está rota (insumo
    // inactivo sin reemplazo) NO se bloquea la cancelación: se devuelve al insumo original.
    let destino: Insumo = insumoCrudo;
    try {
      destino = await this.resolveActiveInsumo(insumoCrudo, manager);
    } catch {
      destino = insumoCrudo;
    }
    // Leer-sumar-escribir: se relee con lock de escritura para no pisar otra venta simultánea.
    const insumo = (await manager.findOne(Insumo, { where: { id: destino.id }, lock: { mode: 'pessimistic_write' } })) ?? destino;
    const newStock = Number(insumo.stockActual) + quantity;
    await manager.update(Insumo, insumo.id, { stockActual: newStock });

    const movement = manager.create(InventoryMovement, {
      insumoId: insumo.id,
      tenantId,
      tipo: tipoMovimiento,
      cantidad: quantity,
      stockResultante: newStock,
      costoUnitario: Number(insumo.costoUnitario),
      referencia: folio,
      sucursalId,
    });
    await manager.save(movement);
  }

  // Merma por la vía existente de Costos (Justifiable, categoría MERMAS_FALTANTES): el stock de
  // estos ítems ya se descontó al ordenar y NO se devuelve (ya se preparó o está en preparación),
  // así que la pérdida queda registrada en dinero para el período, con el detalle de qué se perdió.
  private async registrarMerma(
    manager: EntityManager,
    sale: { id: string; folio: string; tenantId: string; sucursalId: string },
    items: SaleItem[],
    monto: number,
    descripcion: string,
  ): Promise<void> {
    const hoy = new Date();
    const periodo = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    await this.costsService.createJustifiable(
      {
        periodo,
        categoria: JustifiableCategory.MERMAS_FALTANTES,
        descripcion,
        monto,
        detalles: {
          saleId: sale.id,
          folio: sale.folio,
          items: items.map((it) => ({ productoId: it.productoId, nombre: it.nombre, cantidad: it.cantidad })),
        },
        tenantId: sale.tenantId,
        branchId: sale.sucursalId,
      },
      manager,
    );
  }

  // Cancela una cuenta abierta de mesa. Ítems que NO salieron a cocina/barra → devuelven su
  // stock; ítems con NotaCocina emitida → sin devolución, merma. Todo (stock, merma, notas,
  // estado de la venta, mesa) en UNA transacción con lock sobre la venta: si algo falla a medio
  // camino se revierte completo.
  private async cancelarCuentaAbierta(id: string, motivo: string, tenantId: string): Promise<void> {
    const ventaServicioHabilitada = await this.tenantSettingsService.hasPosCapability(tenantId, 'venta_de_servicio');
    await this.dataSource.transaction(async (manager) => {
      const sale = await manager.findOne(Sale, { where: { id, tenantId }, lock: { mode: 'pessimistic_write' } });
      if (!sale) throw new Error('Venta no encontrada');
      if (sale.status !== 'ABIERTA') throw new Error('La cuenta ya no está abierta');
      if (this.sumPagos(sale.formasPago) > 0) {
        throw new BadRequestException('La cuenta tiene pagos parciales; no se puede cancelar');
      }

      const vivos = (sale.items || []).filter((it) => !it.anulado);
      const aDevolver = vivos.filter((it) => !it.notaCocinaId);
      const aMerma = vivos.filter((it) => !!it.notaCocinaId);

      await this.restoreInventory(manager, aDevolver, sale.folio, tenantId, sale.sucursalId, ventaServicioHabilitada);
      if (aMerma.length > 0) {
        const monto = await this.calculateCostoReal(aMerma, tenantId, ventaServicioHabilitada);
        await this.registrarMerma(manager, sale, aMerma, monto, `Cancelación de la cuenta ${sale.folio}: ítems que ya salieron a cocina/barra`);
      }
      // Lo pendiente en cocina/barra deja de mostrarse; lo ya PREPARADO se conserva tal cual.
      await manager.update(NotaCocina, { saleId: id, estado: 'PENDIENTE' }, { estado: 'CANCELADA' });
      await manager.update(Sale, id, { status: 'CANCELADA', motivoCancelacion: motivo });
      await this.liberarMesa(manager, sale);
    });
  }

  private normalizarItems(items: any): SaleItem[] {
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('Se requiere al menos un ítem.');
    }
    return items.map((it, i) => {
      const cantidad = Number(it?.cantidad);
      if (!it || typeof it.productoId !== 'string' || !it.productoId || !(cantidad > 0)) {
        throw new BadRequestException(`Ítem ${i + 1} inválido: productoId y cantidad mayor a cero son requeridos.`);
      }
      const precioUnitario = Number(it.precioUnitario ?? 0);
      const descuento = Number(it.descuento ?? 0);
      const subtotal = it.subtotal !== undefined ? Number(it.subtotal) : precioUnitario * cantidad - descuento;
      if (!Number.isFinite(subtotal) || subtotal < 0 || !Number.isFinite(precioUnitario) || !Number.isFinite(descuento)) {
        throw new BadRequestException(`Ítem ${i + 1} inválido: importes no válidos.`);
      }
      const { notaCocinaId: _n, anulado: _a, ...limpio } = it; // marcas del servidor: no se aceptan del cliente
      return { ...limpio, productoId: it.productoId, nombre: it.nombre ?? '', cantidad, precioUnitario, descuento, subtotal: this.round2(subtotal) };
    });
  }

  // Cuentas abiertas del tenant (con saldo calculado), para que el POS retome una mesa.
  async buscarCuentasAbiertas(tenantId: string | undefined, filters: { tableId?: string; sucursalId?: string } = {}) {
    const t = await this.assertCuentasAbiertasHabilitada(tenantId);
    const where: any = { tenantId: t, status: 'ABIERTA', tableId: filters.tableId || Not(IsNull()) };
    if (filters.sucursalId) where.sucursalId = filters.sucursalId;
    const cuentas = await this.salesRepo.find({ where, order: { createdAt: 'ASC' } });
    return cuentas.map((c) => {
      const pagado = this.sumPagos(c.formasPago);
      return { ...c, pagado, saldoPendiente: this.round2(Number(c.total) - pagado) };
    });
  }

  // Suma consumos a una cuenta abierta (POST /pos/sales/:id/items). Cada ítem nuevo pasa por
  // las mismas reglas que una venta normal: pertenencia al tenant, stockPolicy BLOQUEAR,
  // descuento de inventario (venta_de_servicio lo salta), nota a cocina/barra (solo para los
  // ítems NUEVOS), costoReal. `items` queda append-only: los índices ya usados para dividir por
  // ítems siguen siendo válidos.
  async agregarItems(id: string, data: { items: any[]; impuestos?: number }, tenantId?: string) {
    const t = await this.assertCuentasAbiertasHabilitada(tenantId);
    const nuevos = this.normalizarItems(data?.items);
    const deltaImpuestos = this.round2(Number(data?.impuestos ?? 0));
    if (!Number.isFinite(deltaImpuestos) || deltaImpuestos < 0) {
      throw new BadRequestException('impuestos inválido.');
    }

    const existente = await this.salesRepo.findOne({ where: { id, tenantId: t } });
    if (!existente) throw new NotFoundException('Venta no encontrada');
    if (existente.status !== 'ABIERTA') {
      throw new BadRequestException('Solo se pueden agregar ítems a una cuenta abierta.');
    }

    await this.assertProductsBelongToTenant(nuevos, t);
    const ventaServicioHabilitada = await this.tenantSettingsService.hasPosCapability(t, 'venta_de_servicio');
    const notasCocinaHabilitada = await this.tenantSettingsService.hasPosCapability(t, 'notas_cocina_barra');
    await this.checkStockAvailability(nuevos, t, ventaServicioHabilitada);
    const costoNuevos = await this.calculateCostoReal(nuevos, t, ventaServicioHabilitada);
    const deltaSubtotal = this.round2(nuevos.reduce((s, it) => s + it.subtotal, 0));

    let lowStockInsumos: LowStockInsumo[] = [];
    const actualizada = await this.dataSource.transaction(async (manager) => {
      const sale = await manager.findOne(Sale, { where: { id, tenantId: t }, lock: { mode: 'pessimistic_write' } });
      if (!sale) throw new NotFoundException('Venta no encontrada');
      if (sale.status !== 'ABIERTA') {
        throw new BadRequestException('Solo se pueden agregar ítems a una cuenta abierta.');
      }

      lowStockInsumos = await this.deductInventory(manager, nuevos, sale.folio, t, sale.sucursalId, ventaServicioHabilitada);
      let nuevosMarcados: SaleItem[] = nuevos;
      if (notasCocinaHabilitada) {
        const notaIds = await this.generateNotasCocina(manager, nuevos, sale.id, t, sale.sucursalId);
        nuevosMarcados = nuevos.map((it, i) => (notaIds[i] ? { ...it, notaCocinaId: notaIds[i] as string } : it));
      }

      await manager.update(Sale, id, {
        items: [...(sale.items || []), ...nuevosMarcados],
        subtotal: this.round2(Number(sale.subtotal) + deltaSubtotal),
        impuestos: this.round2(Number(sale.impuestos) + deltaImpuestos),
        total: this.round2(Number(sale.total) + deltaSubtotal + deltaImpuestos),
        costoReal: this.round2(Number(sale.costoReal) + costoNuevos),
      });
      return manager.findOne(Sale, { where: { id } });
    });

    if (lowStockInsumos.length > 0) {
      await this.reportLowStockAlerts(lowStockInsumos, { sucursalId: existente.sucursalId, tenantId: t, cajero: existente.cajero }, existente.folio);
    }
    return actualizada;
  }

  // Quita un ítem de una cuenta abierta (DELETE /pos/sales/:id/items/:index). Según su estado:
  //  - NO salió a cocina/barra → se devuelve su stock por la cadena de Costos y baja el costoReal.
  //  - YA salió (tiene NotaCocina) → NO se devuelve stock; se registra la merma y su nota
  //    pendiente se cancela.
  // La línea se marca anulada en vez de borrarse: los índices usados para dividir la cuenta por
  // ítems no se desplazan si otro cajero cobra al mismo tiempo. El total baja en proporción
  // (conserva impuestos/descuento). Un ítem ya cobrado no se puede quitar, ni uno que deje el
  // total por debajo de lo ya cobrado.
  async quitarItem(id: string, index: number, tenantId?: string) {
    const t = await this.assertCuentasAbiertasHabilitada(tenantId);
    const idx = Number(index);
    if (!Number.isInteger(idx) || idx < 0) {
      throw new BadRequestException('Índice de ítem inválido.');
    }
    const ventaServicioHabilitada = await this.tenantSettingsService.hasPosCapability(t, 'venta_de_servicio');

    return this.dataSource.transaction(async (manager) => {
      const sale = await manager.findOne(Sale, { where: { id, tenantId: t }, lock: { mode: 'pessimistic_write' } });
      if (!sale) throw new NotFoundException('Venta no encontrada');
      if (sale.status !== 'ABIERTA') {
        throw new BadRequestException('Solo se pueden quitar ítems de una cuenta abierta.');
      }

      const items = [...(sale.items || [])];
      const linea = items[idx];
      if (!linea || linea.anulado) {
        throw new BadRequestException(`Ítem ${idx} no existe en la cuenta.`);
      }
      const pagos = Array.isArray(sale.formasPago) ? sale.formasPago : [];
      if (pagos.some((p) => (p.itemIndexes || []).includes(idx))) {
        throw new BadRequestException(`El ítem ${idx} ya fue cobrado: no se puede quitar.`);
      }

      const subtotalActual = Number(sale.subtotal);
      const nuevoSubtotal = this.round2(subtotalActual - Number(linea.subtotal));
      const proporcion = subtotalActual > 0 ? nuevoSubtotal / subtotalActual : 0;
      const nuevoTotal = this.round2(Number(sale.total) * proporcion);
      const nuevoImpuestos = this.round2(Number(sale.impuestos) * proporcion);
      const pagado = this.sumPagos(pagos);
      if (nuevoTotal < pagado) {
        throw new BadRequestException(`No se puede quitar el ítem: el nuevo total (${nuevoTotal}) quedaría por debajo de lo ya cobrado (${pagado}).`);
      }

      const costoLinea = await this.calculateCostoReal([linea], t, ventaServicioHabilitada);
      let costoRealNuevo = Number(sale.costoReal);
      if (linea.notaCocinaId) {
        await this.registrarMerma(manager, sale, [linea], costoLinea, `Ítem quitado de la cuenta ${sale.folio} después de salir a cocina/barra`);
        await manager.update(NotaCocina, { id: linea.notaCocinaId, estado: 'PENDIENTE' }, { estado: 'CANCELADA' });
      } else {
        await this.restoreInventory(manager, [linea], sale.folio, t, sale.sucursalId, ventaServicioHabilitada);
        costoRealNuevo = Math.max(0, costoRealNuevo - costoLinea);
      }

      items[idx] = { ...linea, anulado: true };
      await manager.update(Sale, id, {
        items,
        subtotal: nuevoSubtotal,
        impuestos: nuevoImpuestos,
        total: nuevoTotal,
        costoReal: this.round2(costoRealNuevo),
      });
      return manager.findOne(Sale, { where: { id } });
    });
  }

  // Cobro (total o parcial) de una cuenta abierta (POST /pos/sales/:id/pagos). Mecanismo único
  // para todos los casos, sobre Sale.formasPago (que ya era un arreglo de {forma, monto}):
  //  - cobro total:           sin monto ni itemIndexes → paga el saldo completo.
  //  - dividir entre N:       los primeros N-1 mandan su monto (total/N); el ÚLTIMO omite monto y
  //                           paga exactamente el saldo, así los centavos de redondeo no se pierden.
  //  - dividir por ítems:     itemIndexes (posiciones en `items`) → monto = su parte proporcional
  //                           del total (incluye descuento/impuestos); el último grupo paga el
  //                           saldo. Un ítem no se puede cobrar dos veces.
  // La cuenta pasa a PAGADA solo cuando el saldo llega a 0 (entonces completa la cita ligada y
  // libera la mesa). Nunca se acepta un monto mayor al saldo.
  async cobrarCuenta(
    id: string,
    data: {
      formaPago: string;
      monto?: number;
      itemIndexes?: number[];
      montoRecibido?: number;
      cambio?: number;
      ultimos4Digitos?: string;
      folioVoucher?: string;
      claveRastreo?: string;
      bancoOrigen?: string;
      motivo?: string;
      autorizadoPor?: string;
    },
    tenantId?: string,
  ) {
    const t = await this.assertCuentasAbiertasHabilitada(tenantId);
    const FORMAS = ['EFECTIVO', 'TARJETA', 'DEBITO', 'CREDITO', 'TRANSFERENCIA', 'CORTESIA'];
    if (!data || !FORMAS.includes(data.formaPago)) {
      throw new BadRequestException('formaPago inválida.');
    }
    if (data.monto !== undefined && data.itemIndexes !== undefined) {
      throw new BadRequestException('Manda monto o itemIndexes, no ambos.');
    }

    return this.dataSource.transaction(async (manager) => {
      const sale = await manager.findOne(Sale, { where: { id, tenantId: t }, lock: { mode: 'pessimistic_write' } });
      if (!sale) throw new NotFoundException('Venta no encontrada');
      if (sale.status !== 'ABIERTA') {
        throw new BadRequestException('La cuenta ya no está abierta.');
      }

      const pagos = Array.isArray(sale.formasPago) ? [...sale.formasPago] : [];
      const total = this.round2(Number(sale.total));
      const pagado = this.sumPagos(pagos);
      const saldo = this.round2(total - pagado);
      if (saldo <= 0) {
        throw new BadRequestException('La cuenta no tiene saldo pendiente.');
      }

      let monto: number;
      let indices: number[] | undefined;
      if (data.itemIndexes !== undefined) {
        const items = sale.items || [];
        const yaPagados = new Set<number>(pagos.flatMap((p) => p.itemIndexes || []));
        if (!Array.isArray(data.itemIndexes) || data.itemIndexes.length === 0) {
          throw new BadRequestException('itemIndexes debe ser un arreglo con al menos una posición.');
        }
        indices = [...new Set(data.itemIndexes)];
        for (const idx of indices) {
          if (!Number.isInteger(idx) || idx < 0 || idx >= items.length || items[idx].anulado) {
            throw new BadRequestException(`Ítem ${idx} no existe en la cuenta.`);
          }
          if (yaPagados.has(idx)) {
            throw new BadRequestException(`El ítem ${idx} ya fue cobrado.`);
          }
        }
        const vivos = items.filter((it) => !it.anulado);
        const sumaItems = vivos.reduce((s, it) => s + (Number(it.subtotal) || 0), 0);
        const factor = sumaItems > 0 ? total / sumaItems : 1;
        const seleccion = this.round2(indices.reduce((s, idx) => s + (Number(items[idx].subtotal) || 0), 0) * factor);
        const quedanSinCobrar = vivos.length - yaPagados.size - indices.length;
        monto = quedanSinCobrar === 0 ? saldo : seleccion;
      } else if (data.monto !== undefined) {
        monto = this.round2(Number(data.monto));
        if (!Number.isFinite(monto) || monto <= 0) {
          throw new BadRequestException('monto debe ser mayor a cero.');
        }
      } else {
        monto = saldo;
      }
      if (monto > saldo) {
        throw new BadRequestException(`El monto (${monto}) excede el saldo pendiente (${saldo}).`);
      }

      const entrada: NonNullable<Sale['formasPago']>[number] = {
        forma: data.formaPago as any,
        monto,
        ...(indices ? { itemIndexes: indices } : {}),
        ...(data.montoRecibido !== undefined ? { montoRecibido: Number(data.montoRecibido) } : {}),
        ...(data.cambio !== undefined ? { cambio: Number(data.cambio) } : {}),
        ...(data.ultimos4Digitos ? { ultimos4Digitos: data.ultimos4Digitos } : {}),
        ...(data.folioVoucher ? { folioVoucher: data.folioVoucher } : {}),
        ...(data.claveRastreo ? { claveRastreo: data.claveRastreo } : {}),
        ...(data.bancoOrigen ? { bancoOrigen: data.bancoOrigen } : {}),
        ...(data.motivo ? { motivo: data.motivo } : {}),
        ...(data.autorizadoPor ? { autorizadoPor: data.autorizadoPor } : {}),
      };
      pagos.push(entrada);

      const nuevoSaldo = this.round2(total - this.sumPagos(pagos));
      const cerrada = nuevoSaldo <= 0;
      if (cerrada) {
        await manager.update(Sale, id, {
          formasPago: pagos,
          formaPago: pagos[0].forma,
          status: 'PAGADA',
          montoRecibido: this.round2(pagos.reduce((s, p) => s + (p.montoRecibido ?? p.monto), 0)),
          cambio: this.round2(pagos.reduce((s, p) => s + (p.cambio ?? 0), 0)),
        });
        if (sale.citaId) {
          await this.appointmentsService.completarPorVenta(sale.citaId, t, manager);
        }
        await this.liberarMesa(manager, { tableId: sale.tableId, tenantId: t });
      } else {
        await manager.update(Sale, id, { formasPago: pagos });
      }

      const actualizada = await manager.findOne(Sale, { where: { id } });
      return { sale: actualizada, pagado: this.sumPagos(pagos), saldoPendiente: Math.max(nuevoSaldo, 0), cerrada };
    });
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
      // Cuenta abierta con cobros parciales (mesas_cuenta_abierta): este cobro de un solo pago
      // sobrescribiría formasPago y descuadraría el saldo — se liquida con cobrarCuenta().
      if (this.sumPagos(sale.formasPago) > 0) {
        throw new Error('La cuenta tiene pagos parciales: cobra el saldo desde el cobro de cuenta abierta (/pagos).');
      }

      const cambiosPago = {
        formaPago: data.formaPago as any,
        montoRecibido: data.montoRecibido,
        cambio: data.cambio,
        status: 'PAGADA' as const,
      };

      // Mesa ocupada por esta cuenta (mesas_cuenta_abierta): se libera al cobrar. Solo se consulta
      // la capacidad si la venta tiene tableId — una venta sin mesa no paga ninguna consulta extra.
      const liberaMesa = !!(
        sale.tableId &&
        sale.tenantId &&
        (await this.tenantSettingsService.hasPosCapability(sale.tenantId, 'mesas_cuenta_abierta'))
      );

      if ((sale.citaId && sale.tenantId) || liberaMesa) {
        // Venta ligada a una cita (capacidad ligar_venta_a_cita, validada al crearla) y/o a una
        // mesa: el cobro, la transición de la cita a COMPLETADA y la liberación de la mesa van
        // en la misma transacción.
        await this.dataSource.transaction(async (manager) => {
          await manager.update(Sale, id, cambiosPago);
          if (sale.citaId && sale.tenantId) {
            await this.appointmentsService.completarPorVenta(sale.citaId as string, sale.tenantId, manager);
          }
          if (liberaMesa) await this.liberarMesa(manager, sale);
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
      // Cuenta abierta con cobros parciales: cancelarla dejaría dinero cobrado sin venta que lo
      // respalde — hay que resolver esos pagos (reembolso) antes.
      if (sale.status === 'ABIERTA' && this.sumPagos(sale.formasPago) > 0) {
        throw new BadRequestException('La cuenta tiene pagos parciales; no se puede cancelar');
      }

      const liberaMesa = !!(
        sale.tableId &&
        sale.tenantId &&
        sale.status === 'ABIERTA' &&
        (await this.tenantSettingsService.hasPosCapability(sale.tenantId, 'mesas_cuenta_abierta'))
      );
      if (liberaMesa) {
        // Cuenta abierta de mesa: devuelve stock de lo que no salió a cocina/barra, registra merma
        // de lo que sí salió, cancela notas pendientes y libera la mesa (una sola transacción).
        await this.cancelarCuentaAbierta(id, motivo, sale.tenantId);
      } else {
        await this.salesRepo.update(id, {
          status: 'CANCELADA',
          motivoCancelacion: motivo,
        });
      }

      return this.salesRepo.findOne({ where: { id } });
    } catch (error) {
      console.error('SalesService.cancel error:', error);
      if (error instanceof HttpException) throw error;
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
      if (this.sumPagos(sale.formasPago) > 0) {
        throw new Error('No se puede aplicar descuento a una cuenta con pagos parciales ya cobrados.');
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

  // Devolución TOTAL de una venta PAGADA. Solo se acepta el motivo: ítems e importes se calculan
  // desde la venta original (nada que el cliente pueda inflar). Una sola transacción con lock
  // sobre la original: stock, merma, notas, marca de "devuelta" y registro de la devolución se
  // confirman o se revierten juntos.
  //  - Ítems sin notaCocinaId → regresan al inventario por la cadena de Costos (restoreInventory).
  //  - Ítems que ya salieron a cocina/barra → no regresan; merma en MERMAS_FALTANTES.
  //  - Corte Z: la original pasa a 'DEVUELTA' (sigue contando como venta bruta de SU turno) y la
  //    devolución se registra como una venta 'DEVOLUCION' en el turno abierto actual, con las mismas
  //    formasPago: el corte la suma en totalDevoluciones y la resta del efectivo/tarjeta/transferencia.
  //  - No repetible: la original deja de estar PAGADA (y folio `${folio}-DEV` es único).
  //  - Quién puede: política del tenant (TenantSetting, default SOLO_GERENTE) → con SOLO_GERENTE
  //    exige roleCode ADMIN o GERENTE; con CAJERO_LIBRE cualquier usuario autenticado del POS.
  //    Rechazo 403. Quien ejecutó queda en la devolución (notas y formasPago[].autorizadoPor).
  async getPoliticaDevolucionesParaUsuario(tenantId: string | undefined, actor?: Actor) {
    if (!tenantId) throw new ForbiddenException('Se requiere un tenant.');
    const politica = await this.tenantSettingsService.getPoliticaDevoluciones(tenantId);
    return { politicaDevoluciones: politica, puedeDevolver: this.puedeDevolver(politica, actor) };
  }

  private puedeDevolver(politica: PoliticaDevolucion, actor?: Actor): boolean {
    return politica === 'CAJERO_LIBRE' || ROLES_GERENTE.includes(actor?.roleCode ?? '');
  }

  async returnSale(id: string, data: { motivo?: string; turnoId?: string } | undefined, tenantId?: string, actor?: Actor) {
    if (!tenantId) {
      throw new ForbiddenException('Se requiere un tenant para devolver una venta.');
    }
    const politica = await this.tenantSettingsService.getPoliticaDevoluciones(tenantId);
    if (!this.puedeDevolver(politica, actor)) {
      throw new ForbiddenException('La política de devoluciones de este negocio solo permite devolver a un gerente o administrador. Pide a un gerente que la realice.');
    }
    const quien = actor?.email ?? actor?.id ?? 'desconocido';
    const motivo = String(data?.motivo ?? '').trim();
    if (!motivo) {
      throw new BadRequestException('El motivo de la devolución es requerido.');
    }
    // turnoId opcional: el POS manda su turno actual para que la devolución caiga en SU caja aunque la
    // sucursal tenga otros turnos abiertos. Sin él se usa el más reciente de la sucursal.
    const turnoIdPedido = data?.turnoId;
    if (turnoIdPedido !== undefined && (typeof turnoIdPedido !== 'string' || !turnoIdPedido.trim())) {
      throw new BadRequestException('turnoId inválido.');
    }
    const ventaServicioHabilitada = await this.tenantSettingsService.hasPosCapability(tenantId, 'venta_de_servicio');

    return this.dataSource.transaction(async (manager) => {
      const sale = await manager.findOne(Sale, { where: { id, tenantId }, lock: { mode: 'pessimistic_write' } });
      if (!sale) throw new NotFoundException('Venta no encontrada');
      // Las ventas de delivery no pasaron por caja ni por un turno (turnoId nulo) y su ingreso entró
      // como movimiento bancario: devolverlas aquí descontaría dinero de un turno que nunca lo tuvo y
      // dejaría el ingreso sin revertir. Se devuelven desde la plataforma.
      if (sale.origin === 'DELIVERY') {
        throw new BadRequestException('Las ventas de delivery no se devuelven desde el POS: se devuelven desde la plataforma de delivery.');
      }
      if (sale.status === 'DEVUELTA') throw new BadRequestException('Esta venta ya fue devuelta.');
      // Las filas "-DEV" negativas del esquema anterior siguen siendo PAGADA: no son devolvibles.
      if (sale.status !== 'PAGADA' || Number(sale.total) <= 0) {
        throw new BadRequestException('Solo se puede devolver ventas pagadas');
      }

      let turno: Shift | null;
      if (turnoIdPedido !== undefined) {
        // Turno elegido por quien devuelve: debe ser un turno ABIERTO de este tenant y de la MISMA
        // sucursal que la venta. Un solo mensaje para todo rechazo: no revela si el id existe en
        // otro tenant o sucursal.
        turno = await manager.findOne(Shift, { where: { id: turnoIdPedido.trim(), tenantId } });
        if (!turno || turno.status !== 'ABIERTO' || turno.sucursalId !== sale.sucursalId) {
          throw new BadRequestException('El turno indicado no es un turno abierto de la sucursal de esta venta.');
        }
      } else {
        turno = await manager.findOne(Shift, {
          where: { tenantId, sucursalId: sale.sucursalId, status: 'ABIERTO' },
          order: { createdAt: 'DESC' },
        });
        if (!turno) {
          throw new BadRequestException('No hay un turno abierto en esta sucursal: abre turno antes de devolver una venta.');
        }
      }

      const devFolio = `${sale.folio}-DEV`;
      const vivos = (sale.items || []).filter((it) => !it.anulado);
      const aDevolver = vivos.filter((it) => !it.notaCocinaId);
      const aMerma = vivos.filter((it) => !!it.notaCocinaId);

      await this.restoreInventory(manager, aDevolver, devFolio, tenantId, sale.sucursalId, ventaServicioHabilitada, 'ENTRADA_DEVOLUCION');
      if (aMerma.length > 0) {
        const monto = await this.calculateCostoReal(aMerma, tenantId, ventaServicioHabilitada);
        await this.registrarMerma(manager, sale, aMerma, monto, `Devolución de la venta ${sale.folio}: ítems que ya salieron a cocina/barra`);
      }
      await manager.update(NotaCocina, { saleId: id, estado: 'PENDIENTE' }, { estado: 'CANCELADA' });

      // Cómo se cobró la original: pagos mixtos (formasPago) o un solo pago (formaPago por el total).
      const pagos = Array.isArray(sale.formasPago) && sale.formasPago.length > 0
        ? sale.formasPago.map((p) => ({ forma: p.forma, monto: this.round2(Number(p.monto) || 0), autorizadoPor: quien }))
        : [{ forma: sale.formaPago, monto: this.round2(Number(sale.total)), autorizadoPor: quien }];

      const now = new Date();
      const devolucion = manager.create(Sale, {
        folio: devFolio,
        fecha: now,
        hora: now.toTimeString().slice(0, 8),
        items: vivos,
        subtotal: sale.subtotal,
        descuento: sale.descuento,
        impuestos: sale.impuestos,
        total: sale.total,
        formaPago: pagos[0].forma,
        formasPago: pagos,
        status: 'DEVOLUCION',
        cajero: turno.cajero,
        turnoId: turno.id,
        sucursalId: sale.sucursalId,
        tenantId,
        notas: `Devolución de venta ${sale.folio}. Motivo: ${motivo}. Devolvió: ${quien} (${actor?.roleCode ?? 'sin rol'})`,
        referencia: sale.folio,
      });
      const guardada = await manager.save(devolucion);
      await manager.update(Sale, id, { status: 'DEVUELTA' });
      return guardada;
    });
  }
}

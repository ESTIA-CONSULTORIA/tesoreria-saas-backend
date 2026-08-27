import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { DeliveryIngestDto, DeliveryOrderStatus } from './delivery-ingest.dto';
import { DeliveryQuarantine } from './entities/delivery-quarantine.entity';
import { Sale, SaleItem } from '../../pos/entities/sale.entity';
import { Company } from '../../companies/entities/company.entity';
import { Branch } from '../../branches/entities/branch.entity';
import { Bank } from '../../banks/entities/bank.entity';
import { Movement } from '../../movements/entities/movement.entity';
import { AuditService } from '../../audit/audit.service';
import { ModulesService } from '../../modules/modules.service';

export interface DeliveryIngestResult {
  success: boolean;
  sale_id: string;
  was_duplicate: boolean;
  quarantined?: boolean;
}

// Mismo umbral que MovementsService.create() (movements.service.ts) — un movimiento que
// lo iguala o supera queda PENDING_APPROVAL y no toca el balance todavía. Replicado acá
// (no reutilizado vía MovementsService) porque MovementsService usa sus propios repos
// inyectados, no el `manager` de esta transacción — llamarlo desde adentro del
// dataSource.transaction() de abajo NO lo haría atómico con la Sale (correría en otra
// conexión). Mismo motivo por el que sales.service.ts no llama a un InsumoService para
// deductInventory() y en cambio usa `manager` directo (ver deductInsumo()).
const APPROVAL_THRESHOLD = 50_000;

@Injectable()
export class DeliveryIngestService {
  private readonly logger = new Logger(DeliveryIngestService.name);

  constructor(
    @InjectRepository(Sale)
    private salesRepo: Repository<Sale>,
    @InjectRepository(DeliveryQuarantine)
    private quarantineRepo: Repository<DeliveryQuarantine>,
    @InjectDataSource()
    private dataSource: DataSource,
    private auditService: AuditService,
    private modulesService: ModulesService,
  ) {}

  async ingest(dto: DeliveryIngestDto, meta: { ip: string; userAgent: string }): Promise<DeliveryIngestResult> {
    const company = await this.dataSource.getRepository(Company).findOne({ where: { id: dto.company_id } });
    if (!company) {
      throw new BadRequestException(`company_id '${dto.company_id}' no existe`);
    }

    const branch = await this.dataSource.getRepository(Branch).findOne({ where: { id: dto.branch_id } });
    if (!branch) {
      throw new BadRequestException(`branch_id '${dto.branch_id}' no existe`);
    }
    if (branch.companyId !== dto.company_id) {
      throw new BadRequestException(`branch_id '${dto.branch_id}' no pertenece a company_id '${dto.company_id}'`);
    }

    const tenantId = company.tenantId;

    // Auditoría de seguridad (GoodsHabits): un tenant sin el addon 'delivery' activo no
    // debe generar Sale/Bank/Movement reales — se cuarentena en vez de procesar o
    // rechazar. No es un 403: DeliveryHub Pro recibe un 200 normal (mismo shape de
    // respuesta, con quarantined:true) para que no lo reintente como si fuera un error
    // transitorio — el pedido sí quedó registrado, solo que fuera de reportes/
    // facturación hasta que SOPORTE lo resuelva a mano.
    const hasDelivery = await this.modulesService.hasModule(tenantId, 'delivery');
    if (!hasDelivery) {
      return this.quarantine(dto, tenantId);
    }

    // Chequeo temprano (no atómico, pero evita trabajo de más en el caso común de
    // reintentos de DeliveryHub): si ya existe, devolvemos sin abrir transacción.
    // La red de seguridad real contra la carrera de dos webhooks casi simultáneos con
    // el mismo pedido es el catch de 23505 más abajo, sobre la constraint única
    // (platform, externalOrderId) — mismo patrón que folio en sales.service.ts.
    const existing = await this.salesRepo.findOne({
      where: { platform: dto.platform, externalOrderId: dto.external_order_id },
    });
    if (existing) {
      return { success: true, sale_id: existing.id, was_duplicate: true };
    }

    let saleId: string;
    try {
      saleId = await this.dataSource.transaction(async (manager) => {
        const sale = await this.createDeliverySale(manager, dto, tenantId);

        // Fase 1 = solo dinero, y solo para pedidos completados. Un pedido cancelado
        // queda registrado como Sale (trazabilidad) pero no debe mover un centavo.
        if (dto.status === DeliveryOrderStatus.COMPLETED) {
          await this.postDeliveryIncome(manager, dto, branch.id, tenantId);
        }

        return sale.id;
      });
    } catch (error) {
      if ((error as any)?.code === '23505') {
        // Carrera: otro request con el mismo (platform, externalOrderId) ganó la
        // inserción entre el findOne de arriba y el commit de este. No es un error
        // real — la transacción de este request se revirtió entera, pero la del
        // ganador sí quedó guardada.
        const winner = await this.salesRepo.findOne({
          where: { platform: dto.platform, externalOrderId: dto.external_order_id },
        });
        if (winner) {
          return { success: true, sale_id: winner.id, was_duplicate: true };
        }
      }
      this.logger.error(`Error al ingerir pedido ${dto.platform}/${dto.external_order_id}:`, error);
      throw error;
    }

    // Best-effort, fuera de la transacción de la venta — mismo criterio que
    // reportLowStockAlerts() en sales.service.ts: el pedido ya está confirmado y
    // (si aplicaba) pagado, un fallo acá no debe revertir nada de eso.
    await this.logAudit(dto, tenantId, saleId, meta);

    return { success: true, sale_id: saleId, was_duplicate: false };
  }

  // Mismo criterio de idempotencia que la Sale normal (platform + externalOrderId), pero
  // contra la tabla de cuarentena — un reintento de DeliveryHub para un pedido que ya
  // está en PENDING_REVIEW no debe crear una segunda fila.
  private async quarantine(dto: DeliveryIngestDto, tenantId: string): Promise<DeliveryIngestResult> {
    const existing = await this.quarantineRepo.findOne({
      where: { platform: dto.platform, externalOrderId: dto.external_order_id },
    });
    if (existing) {
      return { success: true, sale_id: existing.id, was_duplicate: true, quarantined: true };
    }

    let q: DeliveryQuarantine;
    try {
      q = await this.quarantineRepo.save(
        this.quarantineRepo.create({
          tenantId,
          companyId: dto.company_id,
          branchId: dto.branch_id,
          platform: dto.platform,
          externalOrderId: dto.external_order_id,
          payload: dto,
          grossAmount: dto.gross_amount,
          status: 'PENDING_REVIEW',
        }),
      );
    } catch (error) {
      // Misma carrera que el catch de 23505 en ingest() sobre Sale — dos webhooks casi
      // simultáneos para el mismo pedido, protegidos por el índice único de la migración
      // (platform, externalOrderId), no solo por el findOne de arriba.
      if ((error as any)?.code === '23505') {
        const winner = await this.quarantineRepo.findOne({
          where: { platform: dto.platform, externalOrderId: dto.external_order_id },
        });
        if (winner) {
          return { success: true, sale_id: winner.id, was_duplicate: true, quarantined: true };
        }
      }
      throw error;
    }

    this.logger.warn(
      `Pedido ${dto.platform}/${dto.external_order_id} puesto en cuarentena — tenant ${tenantId} sin módulo 'delivery' activo.`,
    );

    return { success: true, sale_id: q.id, was_duplicate: false, quarantined: true };
  }

  // Para administration.controller.ts (SOPORTE) — lista lo pendiente de revisar,
  // opcionalmente filtrado por tenant.
  async listQuarantine(tenantId?: string, status?: string): Promise<DeliveryQuarantine[]> {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    if (status) where.status = status;
    return this.quarantineRepo.find({ where, order: { receivedAt: 'DESC' } });
  }

  // action='activate': asegura el módulo activo (idempotente — activateModule() ya
  // maneja el caso "ya existe") y reprocesa el payload guardado por el flujo normal de
  // ingest(), generando la Sale/Bank/Movement real que se hubiera creado en su momento.
  // action='reject': solo cierra el caso, sin generar nada financiero.
  async resolveQuarantine(
    id: string,
    action: 'activate' | 'reject',
    resolvedBy: string,
  ): Promise<DeliveryQuarantine> {
    const q = await this.quarantineRepo.findOne({ where: { id } });
    if (!q) throw new NotFoundException(`No existe un pedido en cuarentena con id '${id}'`);
    if (q.status !== 'PENDING_REVIEW') {
      throw new BadRequestException(`Este pedido ya fue resuelto (status: ${q.status})`);
    }

    if (action === 'reject') {
      q.status = 'REJECTED';
      q.resolvedAt = new Date();
      q.resolvedBy = resolvedBy;
      return this.quarantineRepo.save(q);
    }

    await this.modulesService.activateModule(q.tenantId, 'delivery', 'manual_support', resolvedBy);

    const dto: DeliveryIngestDto = q.payload;
    let saleId: string;
    try {
      saleId = await this.dataSource.transaction(async (manager) => {
        const sale = await this.createDeliverySale(manager, dto, q.tenantId);
        if (dto.status === DeliveryOrderStatus.COMPLETED) {
          await this.postDeliveryIncome(manager, dto, q.branchId, q.tenantId);
        }
        return sale.id;
      });
    } catch (error) {
      if ((error as any)?.code === '23505') {
        // El pedido ya se procesó por otra vía (ej. otro resolve concurrente, o ya
        // había entrado normal después de que se activó el módulo por fuera de este
        // flujo) — no es un error real, solo evita duplicar la Sale.
        const winner = await this.salesRepo.findOne({
          where: { platform: dto.platform, externalOrderId: dto.external_order_id },
        });
        if (winner) {
          saleId = winner.id;
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }

    await this.logAudit(dto, q.tenantId, saleId, { ip: 'internal', userAgent: `admin-resolve:${resolvedBy}` });

    q.status = 'ACTIVATED_AND_PROCESSED';
    q.resolvedAt = new Date();
    q.resolvedBy = resolvedBy;
    q.resultingSaleId = saleId;
    return this.quarantineRepo.save(q);
  }

  private async createDeliverySale(manager: EntityManager, dto: DeliveryIngestDto, tenantId: string): Promise<Sale> {
    const now = new Date();

    const items: SaleItem[] = dto.lines.map((line) => ({
      // Fase 1: sin mapeo de catálogo (ver diagnóstico de DeliveryHub Pro). item_id es
      // el ID crudo de la plataforma (Uber item.id, Rappi item.id, DiDi sku_id) — NO un
      // Product.id real de Estia. Ningún código de Fase 1 debe usar este valor para
      // buscar Product/Recipe/Insumo; queda guardado tal cual como gancho para el
      // matching de catálogo de Fase 2.
      productoId: line.item_id,
      nombre: line.description,
      cantidad: line.quantity,
      precioUnitario: line.unit_price,
      descuento: 0,
      subtotal: line.subtotal,
    }));

    const isCompleted = dto.status === DeliveryOrderStatus.COMPLETED;

    const sale = manager.create(Sale, {
      folio: `DLV-${dto.platform}-${dto.external_order_id}`,
      fecha: now,
      hora: now.toTimeString().slice(0, 8),
      items,
      subtotal: dto.gross_amount,
      descuento: 0,
      impuestos: 0,
      total: dto.gross_amount,
      formaPago: 'TRANSFERENCIA', // liquidación vía plataforma; no hay forma de pago física
      status: isCompleted ? 'PAGADA' : 'CANCELADA',
      cajero: dto.platform,
      // turnoId omitido a propósito (no `null`): el campo no admite null en el tipo TS
      // de Sale (a diferencia de tableId), y no hay concepto de turno/caja para una
      // venta de delivery — queda NULL en la fila por ser nullable en la entidad, sin
      // necesidad de asignarlo.
      sucursalId: dto.branch_id,
      tenantId,
      notas: '',
      referencia: dto.external_order_id,
      motivoCancelacion: isCompleted ? '' : `Pedido cancelado en ${dto.platform}`,
      // No se llama a calculateCostoReal() (Fase 1) — se guarda el costo que ya manda
      // DeliveryHub tal cual, como referencia, sin costeo por receta.
      costoReal: dto.ingredient_cost ?? 0,
      origin: 'DELIVERY',
      platform: dto.platform,
      externalOrderId: dto.external_order_id,
      platformCommission: dto.platform_commission,
      netPayout: dto.net_payout,
      placedAt: new Date(dto.placed_at),
      deliveredAt: dto.delivered_at ? new Date(dto.delivered_at) : null,
    });

    return manager.save(sale);
  }

  private async postDeliveryIncome(manager: EntityManager, dto: DeliveryIngestDto, branchId: string, tenantId: string): Promise<void> {
    const bank = await this.findOrCreateDeliveryBank(manager, branchId, tenantId);

    await this.createMovement(
      manager,
      bank,
      'INCOME',
      'DELIVERY_SALE',
      `Venta ${dto.platform} #${dto.external_order_id}`,
      dto.gross_amount,
      dto.external_order_id,
    );

    if (dto.platform_commission > 0) {
      await this.createMovement(
        manager,
        bank,
        'EXPENSE',
        'DELIVERY_COMMISSION',
        `Comisión ${dto.platform} #${dto.external_order_id}`,
        dto.platform_commission,
        dto.external_order_id,
      );
    }
    // gross_amount (INCOME) - platform_commission (EXPENSE) = net_payout por
    // construcción (mismo cálculo que hacen los normalizers de DeliveryHub). No se
    // postea un tercer movimiento por net_payout — es el resultado, no un evento nuevo.
  }

  private async findOrCreateDeliveryBank(manager: EntityManager, branchId: string, tenantId: string): Promise<Bank> {
    const existing = await manager.findOne(Bank, { where: { branchId, type: 'DELIVERY' } });
    if (existing) return existing;

    try {
      const bank = manager.create(Bank, {
        branchId,
        tenantId,
        name: 'Delivery',
        accountNumber: '',
        bank: 'DELIVERY',
        initialBalance: 0,
        balance: 0,
        currency: 'MXN',
        type: 'DELIVERY',
        isActive: true,
      });
      return await manager.save(bank);
    } catch (error) {
      if ((error as any)?.code === '23505') {
        // Carrera: dos primeros pedidos casi simultáneos para la misma sucursal.
        // El índice único parcial (UQ_bank_branch_delivery) frenó a este insert — no es
        // un error real, la cuenta que sí se creó ya sirve. Recuperado DENTRO de la
        // misma transacción para no arrastrar la Sale (ya creada arriba) a un rollback
        // por una carrera que no le pertenece a ella.
        const winner = await manager.findOne(Bank, { where: { branchId, type: 'DELIVERY' } });
        if (winner) return winner;
      }
      throw error;
    }
  }

  private async createMovement(
    manager: EntityManager,
    bank: Bank,
    type: 'INCOME' | 'EXPENSE',
    category: string,
    concept: string,
    amount: number,
    reference: string,
  ): Promise<void> {
    const numericAmount = Number(amount);
    const requiresApproval = numericAmount >= APPROVAL_THRESHOLD;

    // A diferencia de MovementsService.create(), no se rechaza por "saldo insuficiente"
    // en el EXPENSE de comisión: es un movimiento derivado del propio INCOME que se
    // acaba de acreditar en esta misma transacción, no un retiro manual de usuario.
    if (!requiresApproval) {
      const currentBalance = Number(bank.balance);
      bank.balance = type === 'INCOME' ? currentBalance + numericAmount : currentBalance - numericAmount;
      await manager.save(bank);
    }

    const movement = manager.create(Movement, {
      accountId: bank.id,
      type,
      category,
      concept,
      reference,
      amount: numericAmount,
      status: requiresApproval ? 'PENDING_APPROVAL' : 'APPROVED',
    });
    await manager.save(movement);
  }

  private async logAudit(dto: DeliveryIngestDto, tenantId: string, saleId: string, meta: { ip: string; userAgent: string }): Promise<void> {
    try {
      await this.auditService.createLog({
        userId: 'delivery-webhook',
        userEmail: 'system',
        tenantId: tenantId || 'system',
        action: 'CREATE',
        entity: 'Sale',
        details: {
          platform: dto.platform,
          external_order_id: dto.external_order_id,
          company_id: dto.company_id,
          branch_id: dto.branch_id,
          gross_amount: dto.gross_amount,
          platform_commission: dto.platform_commission,
          status: dto.status,
          sale_id: saleId,
        },
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
    } catch (error) {
      // Best-effort: el pedido ya fue ingerido y confirmado (o cancelado) — un fallo acá
      // no debe afectar la respuesta ni el estado ya persistido.
      this.logger.error(`No se pudo escribir audit log para pedido ${dto.platform}/${dto.external_order_id} (sale ${saleId}):`, error);
    }
  }
}

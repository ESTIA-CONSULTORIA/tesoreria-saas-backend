import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sale } from './entities/sale.entity';
import { Shift } from './entities/shift.entity';
import { SalesService } from './sales.service';
import { AuditService } from '../audit/audit.service';
import { ActorMesas } from '../config/politicas-pos.config';

// Ventas hechas sin conexión que el servidor rechazó al sincronizar (casi siempre porque el precio subió y el cobro ya no
// cubre el total). Viven en la cola del dispositivo (IndexedDB); aquí solo se EVALÚAN y se RESUELVEN, y la resolución queda
// registrada con quién la hizo. Regla de oro: el precio del cliente NUNCA se acepta. Se registra al precio vigente del
// catálogo del tenant; si el cobro no alcanza, la diferencia solo se absorbe si un gerente (o admin) la confirma, y queda
// como una forma de pago CORTESIA autorizada por él. Solo ADMIN y GERENTE (lo exige el controller).
type Contexto = { ip?: string; userAgent?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface EvaluacionVentaOffline {
  folio: string;
  valida: boolean;
  motivo: string | null;
  yaExiste: boolean;
  cobrado: number;
  totalCliente: number | null;
  totalNuevo: number | null;
  diferencia: number | null; // > 0: el cobro no alcanza
  cubre: boolean;
  items: Array<{ productoId: string; nombre: string; cantidad: number; precioCliente: number | null; precioVigente: number | null }>;
}

@Injectable()
export class OfflineVentasService {
  constructor(
    private sales: SalesService,
    @InjectRepository(Sale) private salesRepo: Repository<Sale>,
    @InjectRepository(Shift) private shiftsRepo: Repository<Shift>,
    private audit: AuditService,
  ) {}

  private cobradoDe(payload: any): number {
    const pagos = Array.isArray(payload?.formasPago) ? payload.formasPago : [];
    return round2(pagos.reduce((s: number, p: any) => s + (Number.isFinite(Number(p?.monto)) && Number(p.monto) > 0 ? Number(p.monto) : 0), 0));
  }

  private folioDe(payload: any): string {
    const folio = typeof payload?.folio === 'string' ? payload.folio.trim() : '';
    if (!folio || folio.length > 80) throw new BadRequestException('La venta guardada no trae un folio válido.');
    return folio;
  }

  private async existente(folio: string, tenantId: string): Promise<Sale | null> {
    return this.salesRepo.findOne({ where: { folio, tenantId } });
  }

  // Qué pasaría hoy con esa venta: total vigente, cuánto se cobró y si alcanza. Nunca falla por datos malos: los reporta.
  async evaluar(payload: any, tenantId: string): Promise<EvaluacionVentaOffline> {
    if (!tenantId) throw new ForbiddenException('Se requiere un tenant.');
    const folio = this.folioDe(payload);
    const cobrado = this.cobradoDe(payload);
    const totalCliente = Number.isFinite(Number(payload?.total)) ? round2(Number(payload.total)) : null;
    const yaExiste = !!(await this.existente(folio, tenantId));
    try {
      const calc = await this.sales.calcularImportesVenta(payload?.items, tenantId);
      const diferencia = round2(calc.total - cobrado);
      return {
        folio, valida: true, motivo: null, yaExiste, cobrado, totalCliente, totalNuevo: calc.total, diferencia,
        cubre: diferencia <= 0.01,
        items: calc.items.map((it, i) => ({
          productoId: it.productoId, nombre: it.nombre, cantidad: it.cantidad,
          precioCliente: Number.isFinite(Number(payload.items[i]?.precioUnitario)) ? Number(payload.items[i].precioUnitario) : null,
          precioVigente: it.precioUnitario,
        })),
      };
    } catch (e) {
      return { folio, valida: false, motivo: (e as Error).message, yaExiste, cobrado, totalCliente, totalNuevo: null, diferencia: null, cubre: false, items: [] };
    }
  }

  // Turno donde queda la venta: el original si es un turno ABIERTO de este tenant; si ya se cerró o nunca se sincronizó (id
  // local), el turno abierto más reciente de su sucursal. La sucursal sale del turno (de la BD), no del payload.
  private async resolverTurno(payload: any, tenantId: string): Promise<{ shift: Shift; original: string }> {
    const original = String(payload?.turnoId ?? '');
    const propio = UUID.test(original) ? await this.shiftsRepo.findOne({ where: { id: original, tenantId } }) : null;
    if (propio && propio.status === 'ABIERTO') return { shift: propio, original };
    const sucursalId = propio?.sucursalId ?? (typeof payload?.sucursalId === 'string' ? payload.sucursalId : undefined);
    const abierto = sucursalId
      ? await this.shiftsRepo.findOne({ where: { tenantId, sucursalId, status: 'ABIERTO' }, order: { createdAt: 'DESC' } })
      : null;
    if (!abierto) {
      throw new BadRequestException('No hay un turno abierto en la sucursal de esa venta: abre turno para registrarla, o descártala con motivo.');
    }
    return { shift: abierto, original };
  }

  async registrar(
    payload: any,
    opts: { confirmarDiferencia?: boolean },
    tenantId: string,
    actor: ActorMesas,
    ctx: Contexto,
  ) {
    if (!tenantId) throw new ForbiddenException('Se requiere un tenant.');
    const folio = this.folioDe(payload);

    // Ya está en el servidor (el primer envío sí llegó y se perdió la respuesta): no se duplica.
    const ya = await this.existente(folio, tenantId);
    if (ya) return { yaRegistrada: true, sale: ya, totalNuevo: Number(ya.total), cobrado: this.cobradoDe(payload), diferenciaAbsorbida: 0 };

    const pagos: any[] = Array.isArray(payload?.formasPago) ? payload.formasPago.map((p: any) => ({ ...p })) : [];
    if (pagos.length === 0) throw new BadRequestException('La venta guardada no trae formas de pago: no hay cobro que registrar.');

    // Precio vigente del catálogo del tenant (el del cliente no cuenta). El gerente/admin puede dar descuento.
    const calc = await this.sales.calcularImportesVenta(payload?.items, tenantId, actor);
    const cobrado = this.cobradoDe(payload);
    const diferencia = round2(calc.total - cobrado);
    let diferenciaAbsorbida = 0;
    if (diferencia > 0.01) {
      if (!opts?.confirmarDiferencia) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          code: 'DIFERENCIA_SIN_CONFIRMAR',
          message: `El cobro ($${cobrado}) no cubre el total vigente ($${calc.total}): faltan $${diferencia}. Confirma la diferencia para absorberla como cortesía, o descarta la venta con motivo.`,
          cobrado, total: calc.total, diferencia,
        });
      }
      diferenciaAbsorbida = diferencia;
      pagos.push({
        forma: 'CORTESIA',
        monto: diferencia,
        motivo: 'Diferencia por cambio de precio (venta offline)',
        autorizadoPor: actor.email ?? actor.id,
      });
    }

    const { shift, original } = await this.resolverTurno(payload, tenantId);
    const cuando = new Date().toISOString();
    const nota = [
      `[VENTA OFFLINE REGISTRADA AL PRECIO VIGENTE] Resuelta por ${actor.email ?? actor.id} (${actor.roleCode}) el ${cuando}.`,
      `Cobrado $${cobrado}, total vigente $${calc.total}${diferenciaAbsorbida ? `, diferencia $${diferenciaAbsorbida} absorbida como cortesía` : ''}.`,
      `Cajero original: ${payload?.cajero ?? 'desconocido'}. Turno original: ${original || 'desconocido'}${original !== shift.id ? ` (registrada en el turno ${shift.id})` : ''}.`,
    ].join(' ');

    // create() recalcula todo en el servidor otra vez (misma regla de siempre); aquí solo se le dan producto, cantidad,
    // descuento y lo cobrado. tenantId, turno y sucursal salen del token y de la BD, nunca del payload.
    const sale = await this.sales.create(
      {
        items: payload.items,
        subtotal: 0, descuento: 0, impuestos: 0, total: 0, // se descartan: los pone el servidor
        formasPago: pagos,
        cajero: typeof payload?.cajero === 'string' && payload.cajero ? payload.cajero : (actor.email ?? String(actor.id)),
        turnoId: shift.id,
        sucursalId: shift.sucursalId,
        tenantId,
        folio,
        clientTimestamp: payload?.clientTimestamp,
        citaId: payload?.citaId,
        notas: nota,
      } as any,
      actor,
    );

    try {
      await this.audit.createLog({
        userId: String(actor.id), userEmail: String(actor.email), roleCode: actor.roleCode, tenantId,
        action: 'OFFLINE_SALE_REGISTRADA', entity: 'Sale',
        details: { folio, saleId: (sale as Sale).id, cobrado, totalNuevo: calc.total, diferenciaAbsorbida, turnoOriginal: original, turnoRegistrado: shift.id, cajeroOriginal: payload?.cajero ?? null },
        ipAddress: ctx.ip ?? '', userAgent: ctx.userAgent ?? '',
      });
    } catch (e) {
      // La venta ya quedó (con quién la resolvió en sus notas); el interceptor global de auditoría también registró la llamada.
      console.error(`OfflineVentasService: no se pudo escribir el registro de auditoría de la venta ${folio}:`, e);
    }
    return { yaRegistrada: false, sale, totalNuevo: calc.total, cobrado, diferenciaAbsorbida };
  }

  async descartar(
    body: { folio?: string; motivo?: string; resumen?: any },
    tenantId: string,
    actor: ActorMesas,
    ctx: Contexto,
  ) {
    if (!tenantId) throw new ForbiddenException('Se requiere un tenant.');
    const folio = this.folioDe(body);
    const motivo = typeof body?.motivo === 'string' ? body.motivo.trim() : '';
    if (motivo.length < 5) throw new BadRequestException('El motivo del descarte es obligatorio (mínimo 5 caracteres).');
    if (await this.existente(folio, tenantId)) {
      throw new BadRequestException('Esa venta ya está registrada en el servidor: no se puede descartar.');
    }
    // Sin registro de quién la descartó no hay descarte: si esto falla, falla todo.
    await this.audit.createLog({
      userId: String(actor.id), userEmail: String(actor.email), roleCode: actor.roleCode, tenantId,
      action: 'OFFLINE_SALE_DESCARTADA', entity: 'Sale',
      details: { folio, motivo, resumen: body?.resumen ?? null },
      ipAddress: ctx.ip ?? '', userAgent: ctx.userAgent ?? '',
    });
    return { ok: true };
  }
}

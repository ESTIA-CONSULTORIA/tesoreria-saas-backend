import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AuditService } from '../audit/audit.service';
import { User } from '../users/entities/user.entity';
import { ROLES_CORTESIA, ROLES_DESCUENTO } from '../config/roles-pos.config';
import { PosAutorizacion } from './entities/pos-autorizacion.entity';
import {
  AutorizacionUsable, hashCuenta, hashLineas, hashToken, motivoValido, nuevoToken, TipoAutorizacion, TTL_AUTORIZACION_MS,
} from './autorizaciones.util';

interface Actor { id?: string; email?: string; roleCode?: string; tenantId?: string; branchId?: string | null }
interface Ctx { ip?: string; userAgent?: string }

const VENTANA_MS = 15 * 60 * 1000;
const MAX_FALLOS_USUARIO_IP = 5;
const MAX_FALLOS_USUARIO = 10;

// Un mismo mensaje para "no existe", "no es gerente", "contraseña incorrecta" y "usuario inactivo": no revela cuál fue.
const CREDENCIAL_INVALIDA = 'Autorizador o contraseña incorrectos.';

@Injectable()
export class AutorizacionesService {
  // Fallos de contraseña por (negocio, autorizador, IP) y por (negocio, autorizador). Propio de este servicio: no comparte contadores con el NIP.
  private fallos = new Map<string, { n: number; hasta: number }>();
  now: () => number = () => Date.now();

  constructor(
    @InjectRepository(PosAutorizacion) private repo: Repository<PosAutorizacion>,
    @InjectRepository(User) private users: Repository<User>,
    private audit: AuditService,
  ) {}

  // Gerentes y administradores activos del negocio que pueden autorizar (para elegir en la caja). Un usuario con sucursal ve a los
  // administradores y a los gerentes de su sucursal.
  async autorizadores(actor: Actor): Promise<Array<{ id: string; nombre: string | null; email: string; rol: string }>> {
    if (!actor?.tenantId) return [];
    const todos = await this.users.find({ where: { tenantId: actor.tenantId, roleCode: In(ROLES_CORTESIA), isActive: true }, select: ['id', 'name', 'email', 'roleCode', 'branchId'] });
    return todos
      .filter((u) => !actor.branchId || u.roleCode === 'ADMIN' || !u.branchId || u.branchId === actor.branchId)
      .map((u) => ({ id: u.id, nombre: u.name?.trim() ? u.name.trim() : null, email: u.email, rol: u.roleCode }));
  }

  private llaves(tenantId: string, autorizadorId: string, ip: string): Array<[string, number]> {
    return [[`${tenantId}|${autorizadorId}|${ip}`, MAX_FALLOS_USUARIO_IP], [`${tenantId}|${autorizadorId}`, MAX_FALLOS_USUARIO]];
  }
  private assertSinBloqueo(tenantId: string, autorizadorId: string, ip: string) {
    for (const [k, max] of this.llaves(tenantId, autorizadorId, ip)) {
      const e = this.fallos.get(k);
      if (e && e.hasta > this.now() && e.n >= max) {
        const min = Math.max(1, Math.ceil((e.hasta - this.now()) / 60000));
        throw new HttpException(`Demasiados intentos fallidos. Intenta de nuevo en ${min} min.`, HttpStatus.TOO_MANY_REQUESTS);
      }
    }
  }
  private registrarFallo(tenantId: string, autorizadorId: string, ip: string) {
    for (const [k] of this.llaves(tenantId, autorizadorId, ip)) {
      const e = this.fallos.get(k);
      if (e && e.hasta > this.now()) e.n += 1;
      else this.fallos.set(k, { n: 1, hasta: this.now() + VENTANA_MS });
    }
  }

  // Valida la contraseña ERP del autorizador y entrega un token de un solo uso (2 min) para ESTE ticket o ESTA cuenta.
  // La contraseña y el token nunca se escriben en la bitácora (ni aquí ni en el registro automático: ver audit/redactar.ts).
  async emitir(
    body: { autorizadorId?: string; contrasena?: string; tipo?: string; motivo?: string; items?: any[]; ventaId?: string; descuento?: number },
    actor: Actor,
    ctx: Ctx = {},
  ): Promise<{ token: string; expiraEn: Date; autorizadoPor: { nombre: string | null; email: string; rol: string } }> {
    if (!actor?.tenantId || !actor.id) throw new ForbiddenException('Sesión inválida.');
    if (!ROLES_DESCUENTO.includes(actor.roleCode ?? '')) throw new ForbiddenException('Tu rol no puede pedir autorizaciones.');
    const tipo = body?.tipo as TipoAutorizacion;
    if (tipo !== 'CORTESIA' && tipo !== 'DESCUENTO') throw new BadRequestException('tipo debe ser CORTESIA o DESCUENTO.');
    if (!motivoValido(tipo, body?.motivo)) throw new BadRequestException('El motivo es obligatorio y debe ser uno de la lista.');
    let hash: string;
    if (Array.isArray(body?.items) && body.items.length > 0) hash = hashLineas(body.items);
    else if (body?.ventaId && Number.isFinite(Number(body?.descuento))) hash = hashCuenta(body.ventaId, Number(body.descuento));
    else throw new BadRequestException('Manda las líneas del ticket (items) o la cuenta y su descuento (ventaId, descuento).');
    if (!body.autorizadorId || typeof body.contrasena !== 'string' || !body.contrasena) throw new BadRequestException('Elige al autorizador y escribe su contraseña.');

    const ip = ctx.ip ?? '';
    this.assertSinBloqueo(actor.tenantId, body.autorizadorId, ip);
    const u = await this.users.findOne({
      where: { id: body.autorizadorId, tenantId: actor.tenantId, isActive: true },
      select: ['id', 'name', 'email', 'roleCode', 'branchId', 'password'],
    });
    const sucursalOk = !u?.branchId || !actor.branchId || u.roleCode === 'ADMIN' || u.branchId === actor.branchId;
    const ok = !!u && ROLES_CORTESIA.includes(u.roleCode) && sucursalOk && !!u.password && (await bcrypt.compare(body.contrasena, u.password));
    if (!ok || !u) {
      this.registrarFallo(actor.tenantId, body.autorizadorId, ip);
      throw new ForbiddenException(CREDENCIAL_INVALIDA);
    }
    for (const [k] of this.llaves(actor.tenantId, u.id, ip)) this.fallos.delete(k);

    const { token, tokenHash } = nuevoToken();
    const expiraEn = new Date(this.now() + TTL_AUTORIZACION_MS);
    await this.repo.save(this.repo.create({
      tenantId: actor.tenantId, tokenHash, tipo, motivo: body.motivo as string, hashLineas: hash,
      autorizadoPorId: u.id, autorizadoPorEmail: u.email, autorizadoPorRol: u.roleCode,
      solicitadoPorId: actor.id, solicitadoPorEmail: actor.email ?? actor.id, expiraEn, usadoEn: null,
    }));
    await this.bitacora('POS_AUTORIZACION_EMITIDA', actor, { tipo, motivo: body.motivo, autorizadoPor: u.email, autorizadoPorRol: u.roleCode, expiraEn }, ctx);
    return { token, expiraEn, autorizadoPor: { nombre: u.name?.trim() ? u.name.trim() : null, email: u.email, rol: u.roleCode } };
  }

  // Gasta el token (una sola vez): debe ser del mismo negocio, pedido por quien lo usa, vigente, y de las mismas líneas.
  // Todo fallo es 403 con un mensaje que dice qué hacer, sin revelar datos de otros negocios.
  async consumir(args: { token: string; tenantId: string; hash: string; actor: Actor }): Promise<AutorizacionUsable> {
    const fila = typeof args.token === 'string' && args.token ? await this.repo.findOne({ where: { tokenHash: hashToken(args.token) } }) : null;
    if (!fila || fila.tenantId !== args.tenantId || fila.solicitadoPorId !== args.actor?.id) {
      throw new ForbiddenException('La autorización no es válida. Pide a un gerente que la autorice de nuevo.');
    }
    if (fila.usadoEn) throw new ForbiddenException('Esa autorización ya se usó. Pide a un gerente que la autorice de nuevo.');
    if (new Date(fila.expiraEn).getTime() <= this.now()) throw new ForbiddenException('La autorización venció (dura 2 minutos). Pide a un gerente que la autorice de nuevo.');
    if (fila.hashLineas !== args.hash) throw new ForbiddenException('La autorización no corresponde a este ticket (cambió después de autorizar). Pide a un gerente que la autorice de nuevo.');
    // El autorizador debe seguir activo y con rol de gerente/admin en el momento de usarla.
    const u = await this.users.findOne({ where: { id: fila.autorizadoPorId, tenantId: fila.tenantId, isActive: true }, select: ['id', 'roleCode'] });
    if (!u || !ROLES_CORTESIA.includes(u.roleCode)) throw new ForbiddenException('El autorizador ya no puede autorizar. Pide a otro gerente.');
    // Gastarlo es atómico: si dos cobros la usan a la vez, solo uno la gana.
    const r = await this.repo.update({ id: fila.id, usadoEn: IsNull() }, { usadoEn: new Date(this.now()) });
    if (!r.affected) throw new ForbiddenException('Esa autorización ya se usó. Pide a un gerente que la autorice de nuevo.');
    return { tipo: fila.tipo as TipoAutorizacion, motivo: fila.motivo, autorizadoPorId: fila.autorizadoPorId, autorizadoPorEmail: fila.autorizadoPorEmail, autorizadoPorRol: fila.autorizadoPorRol };
  }

  // Entrada de bitácora de una cortesía o de un descuento autorizado, ya con la venta hecha. Nunca lleva contraseña ni token.
  // Si la bitácora falla, la venta ya quedó (lleva autorizadoPor y motivo en su forma de pago): se avisa en el log, no se deshace.
  async registrarUso(
    action: 'POS_CORTESIA' | 'POS_DESCUENTO_AUTORIZADO',
    actor: Actor,
    tenantId: string,
    detalle: { ventaId?: string; folio?: string; tipo: string; motivo: string; autorizadoPor: string; autorizadoPorRol?: string; via: 'TOKEN' | 'SESION'; monto: number },
    ctx: Ctx = {},
  ): Promise<void> {
    await this.bitacora(action, actor, { ...detalle, cobradoPor: actor?.email ?? actor?.id ?? null, cobradoPorRol: actor?.roleCode ?? null }, ctx, tenantId);
  }

  private async bitacora(action: string, actor: Actor, details: Record<string, unknown>, ctx: Ctx, tenantId?: string): Promise<void> {
    try {
      await this.audit.createLog({
        userId: String(actor?.id ?? 'system'), userEmail: String(actor?.email ?? 'system'), roleCode: actor?.roleCode,
        tenantId: String(tenantId ?? actor?.tenantId ?? 'system'), action, entity: 'Sale', details,
        ipAddress: ctx.ip ?? '', userAgent: ctx.userAgent ?? '',
      });
    } catch (e) {
      console.error(`AutorizacionesService: no se pudo escribir ${action} en la bitácora:`, e);
    }
  }
}

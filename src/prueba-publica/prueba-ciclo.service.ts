import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PruebaPublica } from './entities/prueba-publica.entity';
import { PruebaEvento } from './entities/prueba-evento.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { PruebaPublicaService, type ResultadoPurga } from './prueba-publica.service';
import { CORREO_PROVIDER, type CorreoProvider } from './correo/correo-provider';
import { plantillaAviso } from './correo/plantilla-aviso';
import { DIAS_AVISO, DIAS_PRUEBA, PLAN_PRUEBA, pruebaPublicaActiva, purgaRealActiva, variablesFaltantes } from './prueba-publica.config';

// Tareas programadas de la prueba pública (PP3): vencimiento + purga (a diario de madrugada) y avisos de fin de prueba (a diario en la mañana).
// Todo vive detrás de PRUEBA_PUBLICA_ACTIVA, igual que el resto: apagado, no hace nada. La purga además tiene su propio interruptor
// (PRUEBA_PURGA_ACTIVA): sin él hace ENSAYO (lista y registra, no borra). Los errores se registran a nivel ERROR con el prefijo «ALERTA»
// para poder alertar desde los logs; ninguna tarea tumba la aplicación.

const MS_DIA = 86_400_000;
const MS_HORA = 3_600_000;
const ZONA = 'America/Mexico_City';

/**
 * Avisos que ya corresponde enviar. Con DIAS_PRUEBA = 30: día 25 → quedan 5 días; día 28 → quedan 2; día 30 → el último día (queda 1 día o menos).
 * Solo mientras la prueba sigue vigente: pasado el vencimiento ya no se avisa.
 */
export function avisosDebidos(venceEn: Date, ahora: Date): number[] {
  const restante = venceEn.getTime() - ahora.getTime();
  if (restante <= 0) return [];
  return DIAS_AVISO.filter((dia) => restante <= Math.max(DIAS_PRUEBA - dia, 1) * MS_DIA);
}

export const tipoAviso = (dia: number): string => `AVISO_${dia}`;

const esDuplicado = (e: any): boolean => e?.code === '23505' || /duplicate key|unique/i.test(String(e?.message ?? ''));

export interface ResultadoAvisos {
  enviados: number;
  omitidos: number;
  sinDestinatario: number;
  errores: number;
}

@Injectable()
export class PruebaCicloService {
  private readonly log = new Logger('PruebaCiclo');
  private enCursoVencimiento = false;
  private enCursoAvisos = false;

  constructor(
    private svc: PruebaPublicaService,
    @InjectRepository(PruebaPublica) private pruebas: Repository<PruebaPublica>,
    @InjectRepository(Tenant) private tenants: Repository<Tenant>,
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(PruebaEvento) private eventos: Repository<PruebaEvento>,
    @Inject(CORREO_PROVIDER) private correo: CorreoProvider,
  ) {}

  // ── tareas programadas ──
  @Cron('30 3 * * *', { timeZone: ZONA })
  async tareaVencimientoYPurga(): Promise<void> {
    await this.correrVencimientoYPurga();
  }

  @Cron('0 10 * * *', { timeZone: ZONA })
  async tareaAvisos(): Promise<void> {
    await this.correrAvisos();
  }

  /** ACTIVA → VENCIDA y purga (real solo con PRUEBA_PURGA_ACTIVA=true; si no, ensayo). Devuelve null si no corrió. */
  async correrVencimientoYPurga(ahora = new Date()): Promise<{ vencidas: number; purga: ResultadoPurga } | null> {
    if (!pruebaPublicaActiva() || this.enCursoVencimiento) return null;
    this.enCursoVencimiento = true;
    try {
      const vencidas = await this.svc.marcarVencidas(ahora);
      const real = purgaRealActiva();
      const purga = await this.svc.purgar(ahora, { ensayo: !real });
      this.log.log(`Vencimiento y purga (${real ? 'REAL' : 'ENSAYO'}): ${vencidas} marcadas vencidas, ${purga.candidatas.length} candidatas, ${purga.purgadas} purgadas, ${purga.fallidas.length} fallidas.`);
      if (!real && purga.candidatas.length) {
        this.log.warn(`ENSAYO de purga: ${purga.candidatas.length} negocio(s) de prueba se purgarían (ids: ${purga.candidatas.map((c) => c.pruebaId).join(', ')}). La purga real está apagada (PRUEBA_PURGA_ACTIVA).`);
      }
      for (const f of purga.fallidas) this.log.error(`ALERTA purga fallida de la prueba ${f.pruebaId}: ${f.error}`);
      for (const r of purga.enRiesgo) this.log.error(`ALERTA plazo de privacidad: la prueba ${r.pruebaId} lleva ${r.dias} días vencida sin purgar (máximo 90).${real ? '' : ' La purga real está apagada.'}`);
      return { vencidas, purga };
    } catch (e: any) {
      this.log.error(`ALERTA falló la tarea de vencimiento y purga: ${e?.message ?? e}`);
      return null;
    } finally {
      this.enCursoVencimiento = false;
    }
  }

  async correrAvisos(ahora = new Date()): Promise<ResultadoAvisos | null> {
    if (!pruebaPublicaActiva() || this.enCursoAvisos) return null;
    const faltan = variablesFaltantes();
    if (faltan.length) { this.log.error(`ALERTA avisos de fin de prueba detenidos: faltan variables (${faltan.map((v) => v.split(' ')[0]).join(', ')}).`); return null; }
    this.enCursoAvisos = true;
    try {
      const r = await this.enviarAvisos(ahora);
      this.log.log(`Avisos de fin de prueba: ${r.enviados} enviados, ${r.omitidos} omitidos, ${r.sinDestinatario} sin destinatario, ${r.errores} errores.`);
      if (r.errores) this.log.error(`ALERTA ${r.errores} aviso(s) de fin de prueba no se pudieron enviar; se reintentan en la siguiente corrida.`);
      return r;
    } catch (e: any) {
      this.log.error(`ALERTA falló la tarea de avisos de fin de prueba: ${e?.message ?? e}`);
      return null;
    } finally {
      this.enCursoAvisos = false;
    }
  }

  // ── avisos de fin de prueba (días 25, 28 y 30), idempotentes ──
  /**
   * Recorre las pruebas ACTIVAS y manda a su ADMIN el aviso que toque. Idempotente en dos capas: (1) un registro único por (prueba, aviso) en
   * pruebas_eventos que se reserva ANTES de enviar y (2) la clave de idempotencia del proveedor. Si hay varios avisos pendientes (la tarea faltó
   * días), solo se manda el más reciente y los anteriores se marcan OMITIDO. Un envío fallido libera la reserva y se reintenta en la siguiente corrida.
   */
  async enviarAvisos(ahora = new Date()): Promise<ResultadoAvisos> {
    const res: ResultadoAvisos = { enviados: 0, omitidos: 0, sinDestinatario: 0, errores: 0 };
    const activas = await this.pruebas.find({ where: { estado: 'ACTIVA' } as any });
    for (const p of activas) {
      if (!p.tenantId || !p.venceEn) continue;
      const debidos = avisosDebidos(new Date(p.venceEn), ahora);
      if (!debidos.length) continue;
      try {
        const tenant = await this.tenants.findOne({ where: { id: p.tenantId } as any });
        if (!tenant || tenant.plan !== PLAN_PRUEBA || tenant.isActive === false) continue; // convertida, desactivada o inexistente: no se le avisa
        const dia = Math.max(...debidos);
        for (const anterior of debidos.filter((d) => d !== dia)) {
          if (await this.reservar(p.id, tipoAviso(anterior), 'OMITIDO')) res.omitidos++;
        }
        const admin = (await this.users.find({ where: { tenantId: p.tenantId, roleCode: 'ADMIN', isActive: true } as any }))[0];
        if (!admin?.email) { res.sinDestinatario++; continue; }

        const tipo = tipoAviso(dia);
        const previo = await this.eventos.findOne({ where: { pruebaId: p.id, tipo } as any });
        let evento = previo;
        if (previo) {
          // Ya hay registro: ENVIADO/OMITIDO = hecho. ENVIANDO reciente = otra corrida lo está haciendo; viejo = se cayó antes de confirmar → se reintenta
          // (el proveedor deduplica por clave, así que no puede salir doble).
          if (previo.estado !== 'ENVIANDO' || ahora.getTime() - new Date(previo.createdAt).getTime() < MS_HORA) continue;
        } else {
          try {
            evento = await this.eventos.save(this.eventos.create({ pruebaId: p.id, tipo, estado: 'ENVIANDO' }));
          } catch (e: any) {
            if (esDuplicado(e)) continue; // otra corrida lo reservó primero
            throw e;
          }
        }
        const msg = plantillaAviso({ nombre: p.nombrePersona, dia, venceEn: new Date(p.venceEn), avisoUrl: p.avisoUrl });
        try {
          await this.correo.enviar({ para: admin.email, asunto: msg.asunto, html: msg.html, texto: msg.texto, claveIdempotencia: `prueba:${p.id}:${tipo}` });
          await this.eventos.update({ id: (evento as PruebaEvento).id } as any, { estado: 'ENVIADO' } as any);
          res.enviados++;
        } catch (e: any) {
          res.errores++;
          this.log.error(`No se pudo enviar el ${tipo} de la prueba ${p.id}: ${e?.codigo ?? e?.name ?? 'error'}`); // sin correo ni cuerpo del proveedor
          if (!previo) await this.eventos.delete({ id: (evento as PruebaEvento).id } as any); // libera la reserva: se reintenta mañana
        }
      } catch (e: any) {
        res.errores++;
        this.log.error(`Falló el procesamiento de avisos de la prueba ${p.id}: ${e?.message ?? e}`);
      }
    }
    return res;
  }

  /** Reserva un evento (si no existía). Devuelve true si lo creó ahora. */
  private async reservar(pruebaId: string, tipo: string, estado: string): Promise<boolean> {
    if (await this.eventos.findOne({ where: { pruebaId, tipo } as any })) return false;
    try {
      await this.eventos.save(this.eventos.create({ pruebaId, tipo, estado }));
      return true;
    } catch (e: any) {
      if (esDuplicado(e)) return false;
      throw e;
    }
  }
}

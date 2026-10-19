import { BadRequestException, HttpException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { ListaEsperaGiro } from './entities/lista-espera-giro.entity';
import { cifrarSecreto } from '../facturacion/csd-crypto';
import { GIROS_PROXIMOS, MAX_AVISOS_DIA, MAX_AVISOS_POR_IP_HORA, pruebaPublicaActiva, variablesFaltantes } from './prueba-publica.config';
import { dominioDe, esCorreoValido, esDesechable, hashCorreo, normalizarCorreo } from './prueba-publica.util';
import { CAPTCHA_VERIFIER, type CaptchaVerifier } from './puertos';

export interface AvisoInput { correo?: string; giro?: string; aceptaAviso?: boolean; captcha?: string }

const MS_HORA = 3_600_000;
const MS_DIA = 24 * MS_HORA;
// Respuesta idéntica exista o no el correo en la lista: no se enumera a nadie.
export const MENSAJE_AVISO = 'Listo: te avisaremos por correo cuando la prueba para tu giro esté disponible.';
const MENSAJE_NO_GUARDADO = 'No pudimos guardar tu solicitud ahora. Intenta de nuevo más tarde.';

@Injectable()
export class ListaEsperaService {
  private log = new Logger('ListaEspera');

  constructor(
    @InjectRepository(ListaEsperaGiro) private lista: Repository<ListaEsperaGiro>,
    @Inject(CAPTCHA_VERIFIER) private captcha: CaptchaVerifier,
  ) {}

  // Mismo comportamiento que la prueba: apagada = la ruta no existe; encendida y mal configurada = 503 sin operar (solo se loguean NOMBRES).
  private asegurarActiva() {
    if (!pruebaPublicaActiva()) throw new NotFoundException();
    const faltan = variablesFaltantes();
    if (faltan.length) {
      this.log.error(`Prueba pública encendida pero faltan variables: ${faltan.join(', ')}`);
      throw new ServiceUnavailableException('La prueba no está disponible por ahora.');
    }
  }

  async avisar(input: AvisoInput, ip: string, ahora = new Date()): Promise<{ mensaje: string }> {
    this.asegurarActiva();
    const correo = normalizarCorreo(input.correo);
    const giro = String(input.giro ?? '').trim();
    if (!esCorreoValido(correo)) throw new BadRequestException('Escribe un correo válido.');
    if (!(GIROS_PROXIMOS as readonly string[]).includes(giro)) throw new BadRequestException('Ese giro no está en la lista de aviso.');
    if (input.aceptaAviso !== true) throw new BadRequestException('Debes aceptar el aviso de privacidad para continuar.');
    const dominio = dominioDe(correo);
    if (esDesechable(dominio)) throw new BadRequestException('Usa un correo de tu negocio o personal, no uno temporal.');
    if (!(await this.captcha.verificar(input.captcha, ip))) throw new BadRequestException('No pudimos verificar que eres una persona. Intenta de nuevo.');

    // Si la tabla no existe todavía (el SQL no se ha corrido) o la base falla: error genérico, sin detalles ni el correo en los logs.
    const db = async <T>(op: () => Promise<T>): Promise<T> => {
      try { return await op(); } catch (e: any) {
        this.log.error(`No se pudo usar la lista de espera (${e?.name ?? 'error'}).`);
        throw new ServiceUnavailableException(MENSAJE_NO_GUARDADO);
      }
    };

    const t = ahora.getTime();
    const recientes = await db(() => this.lista.find({ where: { createdAt: MoreThan(new Date(t - MS_DIA)) } as any }));
    const delDia = recientes.filter((r) => t - new Date(r.createdAt).getTime() < MS_DIA);
    if (delDia.filter((r) => r.ip === ip && t - new Date(r.createdAt).getTime() < MS_HORA).length >= MAX_AVISOS_POR_IP_HORA) {
      throw new HttpException('Demasiadas solicitudes desde tu red. Intenta más tarde.', 429);
    }
    if (delDia.length >= MAX_AVISOS_DIA) throw new ServiceUnavailableException(MENSAJE_NO_GUARDADO);

    const correoHash = hashCorreo(correo);
    const ya = await db(() => this.lista.findOne({ where: { correoHash, giro } as any }));
    if (ya) return { mensaje: MENSAJE_AVISO };

    await db(() =>
      this.lista.save(
        this.lista.create({
          correoHash,
          correoDominio: dominio,
          correoCifrado: cifrarSecreto(correo, 'prueba|aviso-giro'),
          giro,
          avisoAceptadoEn: ahora,
          avisoVersion: process.env.PRUEBA_AVISO_VERSION as string,
          avisoUrl: process.env.PRUEBA_AVISO_URL as string,
          ip,
          avisadoEn: null,
        }),
      ),
    );
    return { mensaje: MENSAJE_AVISO };
  }
}

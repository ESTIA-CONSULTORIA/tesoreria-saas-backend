import { BadRequestException, HttpException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PruebaPublica } from './entities/prueba-publica.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { Company } from '../companies/entities/company.entity';
import { Branch } from '../branches/entities/branch.entity';
import { TenantsService } from '../tenants/tenants.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { TenantSettingsService } from '../tenant-settings/tenant-settings.service';
import { ProductsService } from '../pos/products.service';
import { CategoriesService } from '../pos/categories.service';
import { MembresiasService } from '../membresias/membresias.service';
import { cifrarSecreto, descifrarSecreto } from '../facturacion/csd-crypto';
import {
  DIAS_PRUEBA, GIROS_PRUEBA, MAX_ACTIVAS, MAX_ALTAS_DIA, MAX_POR_IP_HORA, PLAN_PRUEBA, RETENCION_DIAS, TOKEN_MINUTOS, pruebaPublicaActiva, variablesFaltantes,
} from './prueba-publica.config';
import { dominioDe, esCorreoValido, esDesechable, generarToken, hashCorreo, hashToken, normalizarCorreo, slugPrueba, validarPassword } from './prueba-publica.util';
import { CAPTCHA_VERIFIER, TENANT_PURGER, type CaptchaVerifier, type TenantPurger } from './puertos';
import { CORREO_PROVIDER, type CorreoProvider } from './correo/correo-provider';
import { enlaceActivacion, plantillaActivacion } from './correo/plantilla-activacion';
import { sembrarGimnasio, type DepsPlantilla } from './plantilla-gimnasio';

// Prueba pública, PP0 (docs/DISENO-PRUEBA-PUBLICA.md). TODO está detrás de PRUEBA_PUBLICA_ACTIVA (apagado por defecto): apagado, los
// endpoints responden 404 y no se crea, envía ni borra nada. Un tenant de prueba es un tenant normal (TenantsService.create) con plan PRUEBA.

const MENSAJE_SOLICITUD = 'Si el correo es válido, te enviamos un enlace para activar tu prueba. Revisa tu bandeja y tu carpeta de spam.';
const ENLACE_INVALIDO = 'El enlace no es válido o ya venció. Pide uno nuevo.';
const MS_HORA = 3_600_000;
const MS_DIA = 86_400_000;

export interface SolicitudInput {
  correo?: string;
  nombre?: string;
  negocio?: string;
  giro?: string;
  captcha?: string;
  /** Casilla del aviso de privacidad. La fecha de aceptación la pone el servidor. */
  aceptaAviso?: boolean;
}

export interface ResultadoPurga {
  ensayo: boolean;
  candidatas: Array<{ pruebaId: string; tenantId: string }>;
  omitidas: Array<{ pruebaId: string; motivo: string }>;
  purgadas: number;
}

@Injectable()
export class PruebaPublicaService {
  private log = new Logger('PruebaPublica');

  constructor(
    @InjectRepository(PruebaPublica) private pruebas: Repository<PruebaPublica>,
    @InjectRepository(Tenant) private tenants: Repository<Tenant>,
    @InjectRepository(Company) private companies: Repository<Company>,
    @InjectRepository(Branch) private branches: Repository<Branch>,
    private tenantsService: TenantsService,
    private subscriptions: SubscriptionsService,
    private settings: TenantSettingsService,
    private products: ProductsService,
    private categories: CategoriesService,
    private membresias: MembresiasService,
    @Inject(CAPTCHA_VERIFIER) private captcha: CaptchaVerifier,
    @Inject(CORREO_PROVIDER) private correo: CorreoProvider,
    @Inject(TENANT_PURGER) private purger: TenantPurger,
  ) {}

  private asegurarActiva() {
    // Apagado = como si la ruta no existiera.
    if (!pruebaPublicaActiva()) throw new NotFoundException();
    // Encendido pero mal configurado: no se opera a medias. Se loguean solo los NOMBRES de lo que falta, nunca valores.
    const faltan = variablesFaltantes();
    if (faltan.length) {
      this.log.error(`Prueba pública encendida pero faltan variables: ${faltan.join(', ')}`);
      throw new ServiceUnavailableException('La prueba no está disponible por ahora.');
    }
  }

  // ── 1. solicitar ──
  async solicitar(input: SolicitudInput, ip: string, ahora = new Date()): Promise<{ mensaje: string }> {
    this.asegurarActiva();
    const correo = normalizarCorreo(input.correo);
    const nombre = String(input.nombre ?? '').trim();
    const negocio = String(input.negocio ?? '').trim();
    const giro = String(input.giro ?? '').trim();
    if (!esCorreoValido(correo)) throw new BadRequestException('Escribe un correo válido.');
    if (!nombre || nombre.length > 120) throw new BadRequestException('Escribe tu nombre (máx. 120 caracteres).');
    if (!negocio || negocio.length > 120) throw new BadRequestException('Escribe el nombre de tu negocio (máx. 120 caracteres).');
    if (!(GIROS_PRUEBA as readonly string[]).includes(giro)) throw new BadRequestException('Por ahora la prueba solo está disponible para gimnasio.');
    if (input.aceptaAviso !== true) throw new BadRequestException('Debes aceptar el aviso de privacidad para continuar.');
    const dominio = dominioDe(correo);
    if (esDesechable(dominio)) throw new BadRequestException('Usa un correo de tu negocio o personal, no uno temporal.');

    if (!(await this.captcha.verificar(input.captcha, ip))) throw new BadRequestException('No pudimos verificar que eres una persona. Intenta de nuevo.');

    const todas = await this.pruebas.find({ where: {} as any });
    const t = ahora.getTime();
    if (todas.filter((p) => p.ip === ip && t - new Date(p.createdAt).getTime() < MS_HORA).length >= MAX_POR_IP_HORA) {
      throw new HttpException('Demasiadas solicitudes desde tu red. Intenta más tarde.', 429);
    }
    const inicioDia = Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate());
    const hoy = todas.filter((p) => new Date(p.createdAt).getTime() >= inicioDia).length;
    const activas = todas.filter((p) => p.estado === 'ACTIVA' || p.estado === 'SOLICITADA').length;
    if (hoy >= MAX_ALTAS_DIA || activas >= MAX_ACTIVAS) {
      throw new ServiceUnavailableException({ message: 'Por ahora no tenemos lugar disponible. Déjanos tu correo en la lista de espera.', listaDeEspera: true });
    }

    // Respuesta idéntica exista o no el correo: no se enumera a nadie, no se envía nada de más.
    const correoHash = hashCorreo(correo);
    if (todas.some((p) => p.correoHash === correoHash && (p.estado === 'ACTIVA' || p.estado === 'SOLICITADA'))) {
      return { mensaje: MENSAJE_SOLICITUD };
    }

    const token = generarToken();
    const fila = await this.pruebas.save(
      this.pruebas.create({
        tenantId: null,
        correoHash,
        correoDominio: dominio,
        correoCifrado: cifrarSecreto(correo, 'prueba|correo'),
        nombreNegocio: negocio,
        nombrePersona: nombre,
        giro,
        // Consentimiento: fecha del servidor + versión y URL del aviso vigentes en este momento (evidencia, no lo que diga el cliente).
        avisoAceptadoEn: ahora,
        avisoVersion: process.env.PRUEBA_AVISO_VERSION as string,
        avisoUrl: process.env.PRUEBA_AVISO_URL as string,
        tokenHash: hashToken(token),
        tokenVenceEn: new Date(t + TOKEN_MINUTOS * 60_000),
        estado: 'SOLICITADA',
        ip,
        venceEn: null,
        extendida: false,
      }),
    );
    const enlace = enlaceActivacion(process.env.PRUEBA_PUBLICA_URL_BASE as string, token);
    const plantilla = plantillaActivacion({ nombre, enlace, avisoUrl: process.env.PRUEBA_AVISO_URL as string });
    try {
      await this.correo.enviar({ para: correo, ...plantilla, claveIdempotencia: `prueba-activacion:${fila.id}` });
    } catch (e: any) {
      // El enlace nunca llegó: la solicitud no sirve. Se invalida (sin correo ni token guardados) para que pueda pedir otra.
      this.log.error(`No se pudo enviar el correo de la prueba ${fila.id}: ${e?.codigo ?? 'ERROR'}`);
      await this.pruebas.update({ id: fila.id } as any, { estado: 'FALLIDA', correoCifrado: null, tokenHash: null } as any);
      throw new ServiceUnavailableException('No pudimos enviar el correo. Intenta de nuevo en unos minutos.');
    }
    return { mensaje: MENSAJE_SOLICITUD };
  }

  // ── 2. activar (el token se canjea UNA vez) ──
  async activar(input: { token?: string; password?: string }, ahora = new Date()): Promise<{ slug: string; venceEn: Date }> {
    this.asegurarActiva();
    const errPass = validarPassword(input.password);
    if (errPass) throw new BadRequestException(errPass);
    if (!input.token || typeof input.token !== 'string' || input.token.length < 20 || input.token.length > 200) throw new BadRequestException(ENLACE_INVALIDO);

    const h = hashToken(input.token);
    const fila = (await this.pruebas.find({ where: { tokenHash: h } as any }))[0];
    if (!fila || fila.estado !== 'SOLICITADA' || !fila.tokenVenceEn || new Date(fila.tokenVenceEn).getTime() <= ahora.getTime()) {
      throw new BadRequestException(ENLACE_INVALIDO); // mismo mensaje para inexistente, usado, vencido o de otro estado
    }
    // Un solo uso, atómico: solo UNA petición logra poner el hash en NULL; las demás (carreras o repeticiones) fallan.
    const reclamo: any = await this.pruebas.update({ id: fila.id, tokenHash: h } as any, { tokenHash: null } as any);
    if (!reclamo?.affected) throw new BadRequestException(ENLACE_INVALIDO);

    let tenantCreado: string | null = null;
    try {
      const correo = descifrarSecreto(fila.correoCifrado as string, 'prueba|correo');
      const venceEn = new Date(ahora.getTime() + DIAS_PRUEBA * MS_DIA);
      const slug = slugPrueba();
      const tenant: any = await this.tenantsService.create({
        legalName: fila.nombreNegocio,
        tradeName: fila.nombreNegocio,
        giro: fila.giro,
        plan: PLAN_PRUEBA,
        email: correo,
        password: input.password as string,
        ownerName: fila.nombrePersona,
        slug,
        billingCycle: 'monthly',
      });
      tenantCreado = tenant.id;
      await this.pruebas.update({ id: fila.id } as any, { tenantId: tenant.id } as any);
      if (tenant.warning) throw new Error(`módulos sin inicializar: ${tenant.warning}`); // el plan PRUEBA no está sembrado en esta base

      const empresa = (await this.companies.find({ where: { tenantId: tenant.id } as any }))[0];
      const sucursal = empresa ? (await this.branches.find({ where: { companyId: empresa.id } as any }))[0] : null;
      if (!empresa || !sucursal) throw new Error('el tenant de prueba no quedó con empresa y sucursal');
      await this.sembrar(fila.giro, tenant.id, sucursal.id);
      await this.subscriptions.fijarFin(tenant.id, venceEn);

      await this.pruebas.update({ id: fila.id } as any, { estado: 'ACTIVA', tenantId: tenant.id, venceEn, correoCifrado: null } as any);
      return { slug, venceEn };
    } catch (e: any) {
      // Sin detalle al público; el motivo queda en el log del servidor (sin correo ni contraseña).
      this.log.error(`Activación fallida de la prueba ${fila.id}: ${e?.message ?? e}`);
      // Un tenant a medio crear no debe quedar utilizable: se desactiva (la limpieza física llega con la purga, PP3).
      if (tenantCreado) await this.tenants.update({ id: tenantCreado } as any, { isActive: false } as any).catch(() => undefined);
      await this.pruebas.update({ id: fila.id } as any, { estado: 'FALLIDA', correoCifrado: null } as any);
      throw new ServiceUnavailableException('No pudimos crear tu prueba. Solicita un enlace nuevo en unos minutos.');
    }
  }

  private depsPlantilla(): DepsPlantilla {
    return {
      configurar: (tenantId, body) => this.settings.upsert(tenantId, body as any),
      crearCategoria: async (tenantId, data) => (await this.categories.create(data as any, tenantId)) as any,
      crearProducto: (tenantId, data) => this.products.create({ name: data.name, price: data.price, categoryId: data.categoryId, branchId: data.branchId, esServicio: data.esServicio } as any, tenantId),
      crearPlan: (tenantId, plan) => this.membresias.crearPlan(tenantId, plan as any),
      crearSocio: (tenantId, socio) => this.membresias.crearSocio(tenantId, socio as any),
    };
  }

  private async sembrar(giro: string, tenantId: string, branchId: string) {
    if (giro === 'gimnasio') return sembrarGimnasio(this.depsPlantilla(), tenantId, branchId);
    throw new Error(`No hay plantilla para el giro ${giro}`);
  }

  // ── 3. ciclo de vida ──
  /** ACTIVA → VENCIDA cuando pasó su fecha. (El bloqueo de acceso ya lo hace SubscriptionGuard con la misma fecha.) */
  async marcarVencidas(ahora = new Date()): Promise<number> {
    const activas = await this.pruebas.find({ where: { estado: 'ACTIVA' } as any });
    let n = 0;
    for (const p of activas) {
      if (p.venceEn && new Date(p.venceEn).getTime() <= ahora.getTime()) {
        await this.pruebas.update({ id: p.id } as any, { estado: 'VENCIDA' } as any);
        n++;
      }
    }
    return n;
  }

  /**
   * Purga de pruebas vencidas. SOLO toca una prueba que cumpla TODO esto (doble seguro): fila VENCIDA + venció hace más de
   * RETENCION_DIAS + el tenant existe y su plan sigue siendo PRUEBA (un tenant convertido a plan de pago nunca se purga).
   * `ensayo` (por defecto) solo lista: no llama al purgador.
   */
  async purgar(ahora = new Date(), opciones: { ensayo?: boolean } = {}): Promise<ResultadoPurga> {
    const ensayo = opciones.ensayo !== false;
    const res: ResultadoPurga = { ensayo, candidatas: [], omitidas: [], purgadas: 0 };
    const vencidas = await this.pruebas.find({ where: { estado: 'VENCIDA' } as any });
    for (const p of vencidas) {
      if (!p.tenantId || !p.venceEn) { res.omitidas.push({ pruebaId: p.id, motivo: 'SIN_TENANT_O_FECHA' }); continue; }
      if (new Date(p.venceEn).getTime() + RETENCION_DIAS * MS_DIA > ahora.getTime()) { res.omitidas.push({ pruebaId: p.id, motivo: 'EN_RETENCION' }); continue; }
      const tenant = await this.tenants.findOne({ where: { id: p.tenantId } as any });
      if (!tenant) { res.omitidas.push({ pruebaId: p.id, motivo: 'TENANT_NO_EXISTE' }); continue; }
      if (tenant.plan !== PLAN_PRUEBA) { res.omitidas.push({ pruebaId: p.id, motivo: 'PLAN_NO_PRUEBA' }); continue; }
      res.candidatas.push({ pruebaId: p.id, tenantId: p.tenantId });
    }
    if (ensayo) return res;
    for (const c of res.candidatas) {
      await this.purger.purgarTenant(c.tenantId);
      await this.pruebas.update({ id: c.pruebaId } as any, { estado: 'PURGADA', correoCifrado: null, tokenHash: null } as any);
      res.purgadas++;
    }
    return res;
  }
}

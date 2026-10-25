import { Body, Controller, ForbiddenException, Get, NotFoundException, Post, Request, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';
import { PruebaPublicaService } from './prueba-publica.service';
import { ListaEsperaService } from './lista-espera.service';
import { ipDe } from './prueba-publica.util';
import { pruebaPublicaActiva } from './prueba-publica.config';

// Endpoints de la prueba. solicitar y activar son PÚBLICOS; estado exige sesión y solo ve la prueba de SU tenant (el del token).
// Con PRUEBA_PUBLICA_ACTIVA apagado (por defecto) los tres responden 404 y no hacen nada. No hay ninguna lectura pública ni listados:
// solo SOPORTE las verá, en una fase posterior.
@Controller('prueba')
export class PruebaPublicaController {
  constructor(private service: PruebaPublicaService, private lista: ListaEsperaService) {}

  // Freno por IP además de los topes propios del servicio.
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('solicitar')
  solicitar(@Body() body: any, @Request() req: any) {
    return this.service.solicitar(body ?? {}, ipDe(req));
  }

  // «Avísame cuando esté listo mi giro»: solo guarda la solicitud de aviso (sin cuenta ni negocio). Con captcha, topes y 404 si está apagada.
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('avisame')
  avisame(@Body() body: any, @Request() req: any) {
    return this.lista.avisar(body ?? {}, ipDe(req));
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('activar')
  activar(@Body() body: { token?: string; password?: string }) {
    return this.service.activar(body ?? {});
  }

  // Días restantes de la prueba del negocio de la sesión. El tenant es SIEMPRE el del token (SOPORTE, sin tenant, recibe 403).
  @Get('estado')
  estado(@Request() req: any) {
    const tenantId = req?.user?.tenantId;
    if (!tenantId) throw new ForbiddenException('Se requiere un negocio (tenant) en la sesión.');
    return this.service.estado(tenantId);
  }

  // ENSAYO de la purga para SOPORTE: solo LISTA qué se purgaría (ids de prueba y de tenant, sin datos personales) y qué está en riesgo del plazo de 90 días. No borra nada.
  @UseGuards(RolesGuard)
  @Roles('SOPORTE')
  @Get('purga/ensayo')
  async purgaEnsayo() {
    if (!pruebaPublicaActiva()) throw new NotFoundException();
    return this.service.purgar(new Date(), { ensayo: true });
  }

  // Avance real de MI negocio de prueba (conteos) para que la guía marque sola los pasos. Solo ADMIN; el tenant es SIEMPRE el del token.
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Get('progreso')
  progreso(@Request() req: any) {
    const tenantId = req?.user?.tenantId;
    if (!tenantId) throw new ForbiddenException('Se requiere un negocio (tenant) en la sesión.');
    return this.service.progreso(tenantId);
  }

  // «Cargar datos de ejemplo» (opcional): siembra la plantilla mínima del giro SOLO en el tenant del token, solo ADMIN y solo si el negocio sigue vacío.
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post('datos-ejemplo')
  datosEjemplo(@Request() req: any) {
    const tenantId = req?.user?.tenantId;
    if (!tenantId) throw new ForbiddenException('Se requiere un negocio (tenant) en la sesión.');
    return this.service.datosEjemplo(tenantId);
  }
}

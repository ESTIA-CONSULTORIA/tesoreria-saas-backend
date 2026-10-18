import { Body, Controller, ForbiddenException, Get, Post, Request } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';
import { PruebaPublicaService } from './prueba-publica.service';
import { ipDe } from './prueba-publica.util';

// Endpoints de la prueba. solicitar y activar son PÚBLICOS; estado exige sesión y solo ve la prueba de SU tenant (el del token).
// Con PRUEBA_PUBLICA_ACTIVA apagado (por defecto) los tres responden 404 y no hacen nada. No hay ninguna lectura pública ni listados:
// solo SOPORTE las verá, en una fase posterior.
@Controller('prueba')
export class PruebaPublicaController {
  constructor(private service: PruebaPublicaService) {}

  // Freno por IP además de los topes propios del servicio.
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('solicitar')
  solicitar(@Body() body: any, @Request() req: any) {
    return this.service.solicitar(body ?? {}, ipDe(req));
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
}

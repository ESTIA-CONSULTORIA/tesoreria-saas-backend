import { Body, Controller, Post, Request } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';
import { PruebaPublicaService } from './prueba-publica.service';
import { ipDe } from './prueba-publica.util';

// Endpoints PÚBLICOS de la prueba (PP0). Con PRUEBA_PUBLICA_ACTIVA apagado (por defecto) ambos responden 404 y no hacen nada.
// No hay ninguna lectura pública: nada lista ni consulta pruebas desde fuera (solo SOPORTE las verá, en una fase posterior).
@Public()
@Controller('prueba')
export class PruebaPublicaController {
  constructor(private service: PruebaPublicaService) {}

  // Freno por IP además de los topes propios del servicio.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('solicitar')
  solicitar(@Body() body: any, @Request() req: any) {
    return this.service.solicitar(body ?? {}, ipDe(req));
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('activar')
  activar(@Body() body: { token?: string; password?: string }) {
    return this.service.activar(body ?? {});
  }
}

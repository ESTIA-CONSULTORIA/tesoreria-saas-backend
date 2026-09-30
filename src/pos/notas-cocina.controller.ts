import { Controller, Get, Put, Param, Query, Request } from '@nestjs/common';
import { NotasCocinaService } from './notas-cocina.service';

// POS flexible, capacidad notas_cocina_barra. Sin @Modulo() de clase ni guard adicional a
// propósito — mismo patrón que InsumoAlertsController: cada endpoint lee req.user.tenantId
// directo, lo que ya funciona transparente para sesiones POS Lite (pos_access_token +
// x-session-scope: pos-lite, ver jwt.middleware.ts) sin necesitar un guard nuevo.
@Controller('pos/notas-cocina')
export class NotasCocinaController {
  constructor(private service: NotasCocinaService) {}

  // Pantalla touch: cada una se configura para ver solo su propia estación
  // (?estacion=COCINA o ?estacion=BARRA) y su propia sucursal — son dos pantallas físicas
  // distintas en la práctica, no una sola vista con todo mezclado.
  @Get()
  findPending(
    @Request() req: any,
    @Query('sucursalId') sucursalId?: string,
    @Query('estacion') estacion?: 'COCINA' | 'BARRA',
  ) {
    return this.service.findPending(req.user.tenantId, sucursalId, estacion);
  }

  @Put(':id/preparado')
  marcarPreparado(@Param('id') id: string, @Request() req: any) {
    return this.service.marcarPreparado(id, req.user.tenantId);
  }
}

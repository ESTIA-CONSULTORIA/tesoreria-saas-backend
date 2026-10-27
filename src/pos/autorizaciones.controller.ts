import { Body, Controller, Get, Post, Request } from '@nestjs/common';
import { AutorizacionesService } from './autorizaciones.service';

// Cortesías y descuentos sobre el tope: el gerente o admin pone su contraseña ERP en la caja de otro y el servidor entrega un token de
// un solo uso (2 min). Todo sale del token de sesión: el tenant nunca viene del cuerpo.
@Controller('pos/autorizaciones')
export class AutorizacionesController {
  constructor(private autorizaciones: AutorizacionesService) {}

  // Gerentes y administradores activos del negocio, para elegir en el modal.
  @Get('autorizadores')
  autorizadores(@Request() req) {
    return this.autorizaciones.autorizadores(req.user ?? {});
  }

  @Post()
  emitir(@Body() body: any, @Request() req) {
    return this.autorizaciones.emitir(body, req.user ?? {}, { ip: req.ip, userAgent: req.headers?.['user-agent'] });
  }
}

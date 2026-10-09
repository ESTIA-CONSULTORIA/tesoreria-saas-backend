import { Body, Controller, Get, Param, Post, Put, Request } from '@nestjs/common';
import { PosChatService } from './pos-chat.service';

// El tenant y el rol salen del token (nunca del body). Sin sesión válida el rol queda vacío y el servicio rechaza.
@Controller('pos-chat')
export class PosChatController {
  constructor(private readonly service: PosChatService) {}

  @Get(':turnoId/messages')
  getMessages(@Param('turnoId') turnoId: string, @Request() req?: any) {
    return this.service.getMessages(turnoId, req?.user?.tenantId, req?.user?.roleCode);
  }

  @Post(':turnoId/messages')
  sendMessage(
    @Param('turnoId') turnoId: string,
    @Body() body: { message: string; type?: string },
    @Request() req?: any,
  ) {
    const userId = req?.user?.sub ?? req?.user?.id ?? 'unknown';
    const userName = req?.user?.name ?? req?.user?.email ?? 'Usuario';
    const role = req?.user?.roleCode ?? 'CAJERO';
    return this.service.sendMessage(turnoId, userId, userName, role, body.message, body.type, req?.user?.tenantId);
  }

  @Put(':turnoId/approve')
  approve(
    @Param('turnoId') turnoId: string,
    @Body() body: { comment?: string },
    @Request() req?: any,
  ) {
    const userId = req?.user?.sub ?? req?.user?.id ?? 'unknown';
    const userName = req?.user?.name ?? req?.user?.email ?? 'Supervisor';
    return this.service.approve(turnoId, userId, userName, req?.user?.roleCode ?? '', body.comment, req?.user?.tenantId);
  }

  @Put(':turnoId/reject')
  reject(
    @Param('turnoId') turnoId: string,
    @Body() body: { comment?: string },
    @Request() req?: any,
  ) {
    const userId = req?.user?.sub ?? req?.user?.id ?? 'unknown';
    const userName = req?.user?.name ?? req?.user?.email ?? 'Supervisor';
    return this.service.reject(turnoId, userId, userName, req?.user?.roleCode ?? '', body.comment, req?.user?.tenantId);
  }
}

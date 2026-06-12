import { Body, Controller, Get, Param, Post, Put, Request } from '@nestjs/common';
import { PosChatService } from './pos-chat.service';

@Controller('pos-chat')
export class PosChatController {
  constructor(private readonly service: PosChatService) {}

  @Get(':turnoId/messages')
  getMessages(@Param('turnoId') turnoId: string) {
    return this.service.getMessages(turnoId);
  }

  @Post(':turnoId/messages')
  sendMessage(
    @Param('turnoId') turnoId: string,
    @Body() body: { message: string; type?: string },
    @Request() req?: any,
  ) {
    const userId = req?.user?.sub ?? 'unknown';
    const userName = req?.user?.name ?? req?.user?.email ?? 'Usuario';
    const role = req?.user?.roleCode ?? 'CAJERO';
    return this.service.sendMessage(turnoId, userId, userName, role, body.message, body.type);
  }

  @Put(':turnoId/approve')
  approve(
    @Param('turnoId') turnoId: string,
    @Body() body: { comment?: string },
    @Request() req?: any,
  ) {
    const userId = req?.user?.sub ?? 'unknown';
    const userName = req?.user?.name ?? req?.user?.email ?? 'Supervisor';
    const role = req?.user?.roleCode ?? 'ADMIN';
    return this.service.approve(turnoId, userId, userName, role, body.comment);
  }

  @Put(':turnoId/reject')
  reject(
    @Param('turnoId') turnoId: string,
    @Body() body: { comment?: string },
    @Request() req?: any,
  ) {
    const userId = req?.user?.sub ?? 'unknown';
    const userName = req?.user?.name ?? req?.user?.email ?? 'Supervisor';
    const role = req?.user?.roleCode ?? 'ADMIN';
    return this.service.reject(turnoId, userId, userName, role, body.comment);
  }
}

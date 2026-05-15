import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import { AuditLogsService } from './audit-logs.service';
import { AuditLog } from './entities/audit-log.entity';

@Controller('audit-logs')
export class AuditLogsController {
  constructor(private auditLogsService: AuditLogsService) {}

  @Post()
  create(@Body() body: Partial<AuditLog>) {
    return this.auditLogsService.create(body);
  }

  @Get()
  findRecent(@Query('limit') limit?: string) {
    return this.auditLogsService.findRecent(Number(limit || 100));
  }

  @Get('module/:module')
  findByModule(@Param('module') module: string) {
    return this.auditLogsService.findByModule(module);
  }
}

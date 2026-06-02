import { Controller, Get, Query, Request, Res } from '@nestjs/common';
import { AuditService } from './audit.service';
import type { Response } from 'express';

@Controller('audit-logs')
export class AuditController {
  constructor(private auditService: AuditService) {}

  @Get()
  async findAll(
    @Request() req,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('entity') entity?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const user = req.user;
    const tenantId = req.tenantId || user?.tenantId;

    // Si el usuario es SOPORTE, puede ver todos los logs
    // Si es ADMIN, solo ve los logs de su tenant
    const filters: any = {};
    
    if (user?.roleCode !== 'SOPORTE') {
      filters.tenantId = tenantId;
    }

    if (userId) {
      filters.userId = userId;
    }

    if (action) {
      filters.action = action;
    }

    if (entity) {
      filters.entity = entity;
    }

    if (startDate) {
      filters.startDate = new Date(startDate);
    }

    if (endDate) {
      filters.endDate = new Date(endDate);
    }

    if (page) {
      filters.page = parseInt(page);
    }

    if (limit) {
      filters.limit = parseInt(limit);
    }

    return this.auditService.findAll(filters);
  }

  @Get('export')
  async exportToCSV(
    @Request() req,
    @Res() res: Response,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('entity') entity?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const user = req.user;
    const tenantId = req.tenantId || user?.tenantId;

    const filters: any = {};
    
    if (user?.roleCode !== 'SOPORTE') {
      filters.tenantId = tenantId;
    }

    if (userId) {
      filters.userId = userId;
    }

    if (action) {
      filters.action = action;
    }

    if (entity) {
      filters.entity = entity;
    }

    if (startDate) {
      filters.startDate = new Date(startDate);
    }

    if (endDate) {
      filters.endDate = new Date(endDate);
    }

    const csvContent = await this.auditService.exportToCSV(filters);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.csv');
    res.send(csvContent);
  }
}

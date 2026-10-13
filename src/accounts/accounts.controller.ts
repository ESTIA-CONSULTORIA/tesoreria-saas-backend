import { Body, Controller, ForbiddenException, Get, Param, Post, Request } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { esSoporte } from '../auth/tenant-access.util';

// Cuentas heredadas (tabla `account`, sin tenantId propio): el tenant sale de branch → company → tenant.
// El tenant SIEMPRE es el del token; solo SOPORTE (sin acotar) ve o crea en cualquier sucursal.
@Controller('accounts')
export class AccountsController {
  constructor(private accountsService: AccountsService) {}

  private tenantDe(req: any): string | undefined {
    if (esSoporte(req?.user)) return undefined;
    const tenantId = req?.user?.tenantId;
    if (!tenantId) throw new ForbiddenException('Sesión sin tenant');
    return tenantId;
  }

  @Post()
  create(
    @Body()
    body: {
      branchId: string;
      name: string;
      type: string;
      currency?: string;
    },
    @Request() req?: any,
  ) {
    return this.accountsService.create(body.branchId, body.name, body.type, body.currency, this.tenantDe(req));
  }

  @Get()
  findAll(@Request() req?: any) {
    return this.accountsService.findAll(this.tenantDe(req));
  }

  @Get('branch/:branchId')
  findByBranch(@Param('branchId') branchId: string, @Request() req?: any) {
    return this.accountsService.findByBranch(branchId, this.tenantDe(req));
  }
}

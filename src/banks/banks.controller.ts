import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Request } from '@nestjs/common';
import { BanksService } from './banks.service';
import { Modulo } from '../auth/modulo.decorator';
import { sucursalEfectiva } from '../common/sucursal-efectiva';
import { tenantDeSesion, tenantParaListar } from '../auth/tenant-access.util';

// Auditoría de seguridad (GoodsHabits, P1): 'tesoreria', igual que transfers.controller.ts
// (ya en producción con ese código) — el catálogo lista 'bancos' como entrada propia, pero
// no hay forma de confirmar contra plan_modules de producción si ese código granular se
// asigna alguna vez; usar el mismo código que ya funciona en Transferencias es la opción
// más segura (decisión explícita de Miguel, no asumida).
@Modulo('tesoreria')
@Controller('banks')
export class BanksController {
  constructor(private banksService: BanksService) {}

  @Post()
  create(
    @Body()
    body: {
      branchId: string;
      name: string;
      accountNumber: string;
      bank: string;
      initialBalance: number;
      currency?: string;
      type: string;
    },
    @Request() req?: any,
  ) {
    const tenantId = tenantDeSesion(req);
    const branchId = req?.user?.branchId || body.branchId;
    return this.banksService.create(
      branchId,
      body.name,
      body.accountNumber,
      body.bank,
      body.initialBalance,
      body.currency || 'MXN',
      body.type,
      tenantId,
    );
  }

  @Get()
  findAll(
    @Headers('x-branch-id') headerBranchId?: string,
    @Headers('x-company-id') headerCompanyId?: string,
    @Request() req?: any,
  ) {
    const userBranchId = req?.user?.branchId;
    const userCompanyId = req?.user?.companyId;

    // La sucursal del usuario manda; el header (Switch Context) solo elige para quien no tiene sucursal (ADMIN/dueño), y
    // el servicio verifica que sea de su tenant.
    const { branchId, restringida } = sucursalEfectiva(req?.user, headerBranchId);
    const companyId = headerCompanyId || userCompanyId;
    // Tenant del token (403 si no es SOPORTE y no lo trae); SOPORTE solo con ?tenantId= explícito. Todo se acota a él.
    const tenantId = tenantParaListar(req, req?.query?.tenantId);
    if (!tenantId) return [];
    if (branchId) return this.banksService.findByBranch(branchId, restringida ? undefined : tenantId);
    if (companyId) return this.banksService.findByCompany(companyId, tenantId);
    return this.banksService.findByTenant(tenantId);
  }

  @Get('branch/:branchId')
  findByBranch(@Param('branchId') branchId: string, @Request() req?: any) {
    // La sucursal pedida por id debe ser del tenant del token (antes se listaban los bancos de cualquier sucursal)
    return this.banksService.findByBranch(branchId, tenantDeSesion(req));
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req?: any) {
    const tenantId = tenantDeSesion(req);
    return this.banksService.findOne(id, tenantId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      branchId?: string;
      name?: string;
      accountNumber?: string;
      bank?: string;
      currency?: string;
      type?: string;
      isActive?: boolean;
    },
    @Request() req?: any,
  ) {
    // Auditoría de seguridad (GoodsHabits, hallazgo #1 BUSINESS): tenantId siempre del JWT.
    const tenantId = tenantDeSesion(req);
    return this.banksService.update(id, body, tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req?: any) {
    const tenantId = tenantDeSesion(req);
    return this.banksService.remove(id, tenantId);
  }
}

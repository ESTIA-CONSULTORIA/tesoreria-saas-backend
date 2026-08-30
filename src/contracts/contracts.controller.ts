import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Query, Request, Headers } from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { Modulo } from '../auth/modulo.decorator';

// Auditoría de seguridad (GoodsHabits, P1): 'rh', no 'contratos'/'expedientes' — no
// existe ese código en el catálogo (MODULES_CATALOG, seed.ts), Expedientes es parte del
// mismo addon RH, no un módulo vendible aparte. Confirmado antes de aplicar, no asumido.
@Modulo('rh')
@Controller('contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Get('templates')
  getTemplates(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-company-id') companyId: string,
    @Request() req: any,
  ) {
    // Auditoría de seguridad (GoodsHabits): el header x-tenant-id/x-company-id es
    // controlable por el cliente — antes se evaluaba ANTES que el JWT, así que cualquier
    // usuario autenticado podía leer/generar contratos de otro tenant mandando el header a
    // mano. El JWT (fuente verificada) va primero; el header queda solo como fallback para
    // cuando el JWT no trae tenantId (SOPORTE).
    const tid = req?.user?.tenantId || tenantId;
    const cid = req?.user?.companyId || companyId;
    return this.contractsService.getTemplates(tid, cid);
  }

  @Post('templates')
  uploadTemplate(
    @Body() body: any,
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-company-id') companyId: string,
    @Request() req: any,
  ) {
    // Auditoría de seguridad (GoodsHabits): el header x-tenant-id/x-company-id es
    // controlable por el cliente — antes se evaluaba ANTES que el JWT, así que cualquier
    // usuario autenticado podía leer/generar contratos de otro tenant mandando el header a
    // mano. El JWT (fuente verificada) va primero; el header queda solo como fallback para
    // cuando el JWT no trae tenantId (SOPORTE).
    const tid = req?.user?.tenantId || tenantId;
    const cid = req?.user?.companyId || companyId;
    return this.contractsService.uploadTemplate({ ...body, tenantId: tid, companyId: cid });
  }

  @Delete('templates/:id')
  deleteTemplate(@Param('id') id: string) {
    return this.contractsService.deleteTemplate(id);
  }

  @Get()
  getContracts(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-company-id') companyId: string,
    @Query('employeeId') employeeId: string,
    @Request() req: any,
  ) {
    // Auditoría de seguridad (GoodsHabits): el header x-tenant-id/x-company-id es
    // controlable por el cliente — antes se evaluaba ANTES que el JWT, así que cualquier
    // usuario autenticado podía leer/generar contratos de otro tenant mandando el header a
    // mano. El JWT (fuente verificada) va primero; el header queda solo como fallback para
    // cuando el JWT no trae tenantId (SOPORTE).
    const tid = req?.user?.tenantId || tenantId;
    const cid = req?.user?.companyId || companyId;
    return this.contractsService.getContracts(tid, employeeId, cid);
  }

  @Post('generate')
  generateContract(
    @Body() body: any,
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-company-id') companyId: string,
    @Request() req: any,
  ) {
    // Auditoría de seguridad (GoodsHabits): el header x-tenant-id/x-company-id es
    // controlable por el cliente — antes se evaluaba ANTES que el JWT, así que cualquier
    // usuario autenticado podía leer/generar contratos de otro tenant mandando el header a
    // mano. El JWT (fuente verificada) va primero; el header queda solo como fallback para
    // cuando el JWT no trae tenantId (SOPORTE).
    const tid = req?.user?.tenantId || tenantId;
    const cid = req?.user?.companyId || companyId;
    return this.contractsService.generateContract({ ...body, tenantId: tid, companyId: cid });
  }

  @Post(':id/sign')
  signContract(
    @Param('id') contractId: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    const ip = req?.ip || req?.headers?.['x-forwarded-for'] || 'N/D';
    return this.contractsService.signContract({ ...body, contractId, ip });
  }

  @Get(':id/pdf')
  getContractPdf(@Param('id') id: string) {
    return this.contractsService.getContractPdf(id);
  }

  @Get(':id/evidence')
  getEvidencePdf(@Param('id') id: string) {
    return this.contractsService.getEvidencePdf(id);
  }

  // ═══════════════════════════════════════════════════════════════
  // Portal del empleado — Fase 3, Firma electrónica
  // ═══════════════════════════════════════════════════════════════

  @Get('portal/pending')
  async getPortalContracts(@Request() req: any) {
    const employeeId = await this.contractsService.resolveEmployeeIdFromUser(req?.user?.id);
    if (!employeeId) return [];
    return this.contractsService.getPortalContracts(employeeId);
  }

  @Post('portal/:id/verify-ine')
  async verifyIne(
    @Param('id') _contractId: string,
    @Body() body: { ineFrontBase64: string; tipo?: string },
    @Request() req: any,
  ) {
    const employeeId = await this.contractsService.resolveEmployeeIdFromUser(req?.user?.id);
    if (!employeeId) throw new NotFoundException('Empleado no encontrado');
    return this.contractsService.verifyIneForEmployee(employeeId, body.ineFrontBase64, body.tipo);
  }

  // Auditoría de seguridad (GoodsHabits, Fase 3 — Firma electrónica): employeeId se
  // resuelve del JWT del Portal (req.user.id → Employee.userId), nunca del body — un
  // empleado no puede mandar el employeeId de alguien más para firmar en su nombre.
  @Post('portal/:id/sign')
  async signContractAsEmployee(
    @Param('id') contractId: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    const employeeId = await this.contractsService.resolveEmployeeIdFromUser(req?.user?.id);
    if (!employeeId) throw new NotFoundException('Empleado no encontrado');
    const ip = req?.ip || req?.headers?.['x-forwarded-for'] || 'N/D';
    return this.contractsService.signContractAsEmployee({ ...body, contractId, ip, employeeId });
  }

  @Get('portal/:id/evidence')
  async getPortalEvidence(@Param('id') id: string, @Request() req: any) {
    const employeeId = await this.contractsService.resolveEmployeeIdFromUser(req?.user?.id);
    if (!employeeId) throw new NotFoundException('Empleado no encontrado');
    return this.contractsService.getEvidencePdfForEmployee(id, employeeId);
  }
}

import { tenantParaEscribir } from '../auth/tenant-access.util';
import { Body, Controller, Delete, Get, Param, Post, Put, Request } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { Modulo } from '../auth/modulo.decorator';

// Auditoría de seguridad (GoodsHabits, P1): sin @Modulo() un tenant sin el addon
// Integraciones ($500, catálogo modules.code='integraciones') podía llamar /integrations
// directo. No confundir con delivery-ingest.controller.ts (mismo directorio) — ese usa
// un mecanismo de auth completamente distinto (cuenta de servicio SOPORTE), @Modulo()
// no aplicaría ahí (ver nota en ese archivo, pendiente de resolver aparte).
@Modulo('integraciones')
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly service: IntegrationsService) {}

  @Get()
  findAll(@Request() req?: any) {
    const tenantId = tenantParaEscribir(req, req?.query?.tenantId); // tenant del token (SOPORTE con ?tenantId=); sin tenant ya no opera sobre integraciones ajenas
    const companyId = req?.user?.companyId;
    return this.service.findAll(tenantId, companyId);
  }

  @Post(':slug/activate')
  activate(@Param('slug') slug: string, @Body() body: { credentials: Record<string, string>; config?: Record<string, any> }, @Request() req?: any) {
    const tenantId = tenantParaEscribir(req, req?.query?.tenantId); // tenant del token (SOPORTE con ?tenantId=); sin tenant ya no opera sobre integraciones ajenas
    return this.service.activate(tenantId, slug, body.credentials, body.config);
  }

  @Delete(':slug')
  deactivate(@Param('slug') slug: string, @Request() req?: any) {
    const tenantId = tenantParaEscribir(req, req?.query?.tenantId); // tenant del token (SOPORTE con ?tenantId=); sin tenant ya no opera sobre integraciones ajenas
    return this.service.deactivate(tenantId, slug);
  }

  @Put(':slug/config')
  updateConfig(@Param('slug') slug: string, @Body() config: Record<string, any>, @Request() req?: any) {
    const tenantId = tenantParaEscribir(req, req?.query?.tenantId); // tenant del token (SOPORTE con ?tenantId=); sin tenant ya no opera sobre integraciones ajenas
    return this.service.updateConfig(tenantId, slug, config);
  }

  @Get(':slug/test')
  testConnection(@Param('slug') slug: string, @Request() req?: any) {
    const tenantId = tenantParaEscribir(req, req?.query?.tenantId); // tenant del token (SOPORTE con ?tenantId=); sin tenant ya no opera sobre integraciones ajenas
    return this.service.testConnection(tenantId, slug);
  }
}

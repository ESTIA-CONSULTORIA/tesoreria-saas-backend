import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';

import { ReconciliationService } from './reconciliation.service';
import { Reconciliation } from './entities/reconciliation.entity';

@Controller('reconciliation')
export class ReconciliationController {
  constructor(private reconciliationService: ReconciliationService) {}

  @Post()
  reconcile(@Body() body: Partial<Reconciliation>) {
    return this.reconciliationService.reconcile(body);
  }

  @Get('differences')
  findDifferences() {
    return this.reconciliationService.findPendingDifferences();
  }

  @Patch(':id/resolve')
  resolve(
    @Param('id') id: string,
    @Body() body: { notes?: string },
  ) {
    return this.reconciliationService.resolve(id, body.notes);
  }
}

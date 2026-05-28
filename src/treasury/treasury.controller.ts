import { Controller, Get } from '@nestjs/common';
import { TreasuryService } from './treasury.service';

@Controller('treasury')
export class TreasuryController {
  constructor(private treasuryService: TreasuryService) {}

  @Get('summary')
  getSummary() {
    return this.treasuryService.getSummary();
  }
}

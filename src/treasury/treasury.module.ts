import { Module } from '@nestjs/common';

import { MovementsModule } from '../movements/movements.module';
import { TreasuryMovementService } from './services/treasury-movement.service';
import { TreasuryForecastService } from './services/treasury-forecast.service';
import { TreasuryRiskAlertService } from './services/treasury-risk-alert.service';

@Module({
  imports: [MovementsModule],
  providers: [
    TreasuryMovementService,
    TreasuryForecastService,
    TreasuryRiskAlertService,
  ],
  exports: [
    TreasuryMovementService,
    TreasuryForecastService,
    TreasuryRiskAlertService,
  ],
})
export class TreasuryModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AddonsController } from './addons.controller';
import { AddonsService } from './addons.service';
import { AddonSubscription } from './entities/addon-subscription.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AddonSubscription])],
  controllers: [AddonsController],
  providers: [AddonsService],
  exports: [AddonsService],
})
export class AddonsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PosMessage } from './entities/pos-message.entity';
import { PosChatService } from './pos-chat.service';
import { PosChatController } from './pos-chat.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PosMessage])],
  providers: [PosChatService],
  controllers: [PosChatController],
})
export class PosChatModule {}

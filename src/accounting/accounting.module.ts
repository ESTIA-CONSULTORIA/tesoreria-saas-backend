import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ChartAccount } from './entities/chart-account.entity';
import { JournalEntry } from './entities/journal-entry.entity';
import { JournalEntryLine } from './entities/journal-entry-line.entity';
import { PostingEngineService } from './services/posting-engine.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChartAccount,
      JournalEntry,
      JournalEntryLine,
    ]),
  ],
  providers: [PostingEngineService],
  exports: [PostingEngineService],
})
export class AccountingModule {}

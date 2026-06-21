import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { Report } from './entities/report.entity';
import { Movement } from '../movements/entities/movement.entity';
import { Bank } from '../banks/entities/bank.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Company } from '../companies/entities/company.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Report, Movement, Bank, Branch, Company])],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}

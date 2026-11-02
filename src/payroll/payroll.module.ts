import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayrollService } from './payroll.service';
import { PayrollController } from './payroll.controller';
import { PayrollRun } from './entities/payroll-run.entity';
import { PayrollEntry } from './entities/payroll-entry.entity';
import { PayrollConceptTemplate } from './entities/payroll-concept-template.entity';
import { EmployeeIncapacity } from './entities/employee-incapacity.entity';
import { MovementsModule } from '../movements/movements.module';

@Module({
  imports: [TypeOrmModule.forFeature([PayrollRun, PayrollEntry, PayrollConceptTemplate, EmployeeIncapacity]), MovementsModule],
  controllers: [PayrollController],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from './entities/employee.entity';
import { HrDocument } from './entities/hr-document.entity';
import { HrService } from './hr.service';
import { HrController } from './hr.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Employee, HrDocument])],
  providers: [HrService],
  controllers: [HrController],
})
export class HrModule {}

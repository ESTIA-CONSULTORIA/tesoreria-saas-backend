import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from './entities/employee.entity';
import { HrDocument } from './entities/hr-document.entity';
import { VacationRequest } from './entities/vacation-request.entity';
import { PermissionRequest } from './entities/permission-request.entity';
import { HrShift } from './entities/hr-shift.entity';
import { Attendance } from './entities/attendance.entity';
import { BiometricCredential } from './entities/biometric-credential.entity';
import { Branch } from '../branches/entities/branch.entity';
import { HrService } from './hr.service';
import { HrController } from './hr.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Employee,
      HrDocument,
      VacationRequest,
      PermissionRequest,
      HrShift,
      Attendance,
      BiometricCredential,
      Branch,
    ]),
  ],
  providers: [HrService],
  controllers: [HrController],
  exports: [HrService],
})
export class HrModule {}

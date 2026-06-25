import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from './entities/employee.entity';
import { HrDocument } from './entities/hr-document.entity';
import { VacationRequest } from './entities/vacation-request.entity';
import { PermissionRequest } from './entities/permission-request.entity';
import { HrShift } from './entities/hr-shift.entity';
import { Attendance } from './entities/attendance.entity';
import { BiometricCredential } from './entities/biometric-credential.entity';
import { AttendanceAudit } from './entities/attendance-audit.entity';
import { Branch } from '../branches/entities/branch.entity';
import { OcrModule } from '../ocr/ocr.module';
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
      AttendanceAudit,
      BiometricCredential,
      Branch,
    ]),
    OcrModule,
  ],
  providers: [HrService],
  controllers: [HrController],
  exports: [HrService],
})
export class HrModule {}

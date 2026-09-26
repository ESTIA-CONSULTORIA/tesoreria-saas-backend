import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cita } from './entities/cita.entity';
import { Patient } from '../patients/entities/patient.entity';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';

// Módulo dedicado en vez de agregar Cita a PatientsModule: mismo criterio ya usado en el
// resto del ERP (transfers.module.ts es su propio módulo aunque depende de Bank) — Patient
// se importa directo como entidad para validar existencia (mismo patrón de bajo
// acoplamiento que sales.service.ts usa con Insumo, sin importar CostsModule completo).
@Module({
  imports: [TypeOrmModule.forFeature([Cita, Patient])],
  providers: [AppointmentsService],
  controllers: [AppointmentsController],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}

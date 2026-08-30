import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContractsService } from './contracts.service';
import { ContractsController } from './contracts.controller';
import { ContractTemplate } from './entities/contract-template.entity';
import { Contract } from './entities/contract.entity';
import { OcrModule } from '../ocr/ocr.module';
import { ModulesModule } from '../modules/modules.module';
import { FACE_MATCH_PROVIDER } from './face-match/face-match-provider.interface';
import { NullFaceMatchProvider } from './face-match/null-face-match.provider';

@Module({
  // OcrModule: reutiliza extractTextFromBuffer/extractHrFields/compareToEmployee para el
  // paso de verificación de INE del Portal — Fase 3, Firma electrónica. ModulesModule:
  // para consultar si el tenant tiene 'validacion_facial' activo antes de invocar el
  // FaceMatchProvider.
  imports: [TypeOrmModule.forFeature([ContractTemplate, Contract]), OcrModule, ModulesModule],
  controllers: [ContractsController],
  providers: [
    ContractsService,
    // Auditoría de producto (GoodsHabits, Fase 3 — Firma electrónica): único proveedor de
    // esta fase, sin conectar ningún servicio real (decisión explícita). Cambiar de
    // proveedor después es registrar otra clase bajo este mismo token — ContractsService
    // no cambia.
    { provide: FACE_MATCH_PROVIDER, useClass: NullFaceMatchProvider },
  ],
  exports: [ContractsService],
})
export class ContractsModule {}

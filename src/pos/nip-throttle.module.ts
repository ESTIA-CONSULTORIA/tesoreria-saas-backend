import { Module } from '@nestjs/common';
import { NipThrottleService } from './nip-throttle.service';

// Una sola instancia del limitador de NIP para todo el backend: el login por NIP del POS y el check-in de membresías cuentan
// sus fallos en el mismo servicio (con llaves separadas por prefijo), así un reinicio o un segundo módulo no lo duplican.
@Module({
  providers: [NipThrottleService],
  exports: [NipThrottleService],
})
export class NipThrottleModule {}

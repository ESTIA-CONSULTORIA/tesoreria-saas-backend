import { Injectable } from '@nestjs/common';
import { FaceMatchProvider, FaceMatchResult } from './face-match-provider.interface';

// Auditoría de producto (GoodsHabits, Fase 3 — Firma electrónica): único proveedor de esta
// fase — no llama a ningún servicio externo, no calcula nada. Confirma que el punto de
// extensión funciona (se puede invocar, devuelve una forma de dato consistente) sin
// simular un resultado real que alguien podría confundir con una validación de verdad.
@Injectable()
export class NullFaceMatchProvider implements FaceMatchProvider {
  async compare(): Promise<FaceMatchResult> {
    return { score: null, isMatch: null, skipped: true };
  }
}

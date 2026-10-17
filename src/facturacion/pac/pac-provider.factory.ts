import { MockPacProvider } from './mock-pac.provider';
import type { PacProvider } from './pac-provider';

// F0: solo existe el adaptador Mock. Cuando haya adaptadores reales, aquí se elige por `provider_binding` (tenant + capacidad);
// hasta entonces CUALQUIER nombre resuelve al Mock, de modo que nada puede timbrar de verdad por un error de configuración.
export function crearPacProvider(_adaptador?: string): PacProvider {
  return new MockPacProvider();
}

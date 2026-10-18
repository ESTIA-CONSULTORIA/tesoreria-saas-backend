import type { CorreoProvider } from './correo-provider';
import { MockCorreoProvider } from './mock-correo.provider';
import { ResendCorreoProvider } from './resend-correo.provider';

// Se elige por CORREO_PROVIDER (por defecto «mock»). Un nombre desconocido cae en Mock a propósito: nunca se envía nada «por accidente»;
// y con el Mock la prueba pública se niega a operar en producción (ver variablesFaltantes en prueba-publica.config.ts).
export function crearCorreoProvider(nombre: string | undefined = process.env.CORREO_PROVIDER): CorreoProvider {
  switch ((nombre ?? 'mock').toLowerCase()) {
    case 'resend':
      return new ResendCorreoProvider();
    default:
      return new MockCorreoProvider();
  }
}

import { CorreoError, type CorreoProvider, type MensajeCorreo, type ResultadoEnvio } from './correo-provider';

export interface MockCorreoOpciones {
  /** Fuerza el fallo del envío (para probar el camino de error). */
  fallar?: 'RECHAZADO' | 'NO_DISPONIBLE';
}

// Adaptador de pruebas: NO envía nada. Guarda los mensajes en memoria del proceso (para que los specs lean el enlace) y es idempotente
// por `claveIdempotencia`, igual que lo exigimos a un proveedor real. No escribe a logs: el mensaje lleva el token de activación.
export class MockCorreoProvider implements CorreoProvider {
  readonly nombre = 'mock';
  readonly enviados: Array<MensajeCorreo & { id: string }> = [];

  constructor(private opciones: MockCorreoOpciones = {}) {}

  async enviar(m: MensajeCorreo): Promise<ResultadoEnvio> {
    if (!m.claveIdempotencia) throw new Error('claveIdempotencia es obligatoria');
    if (this.opciones.fallar) throw new CorreoError(this.opciones.fallar, 'Fallo simulado del proveedor de correo.');
    const previo = this.enviados.find((e) => e.claveIdempotencia === m.claveIdempotencia);
    if (previo) return { id: previo.id };
    const id = `mock-${this.enviados.length + 1}`;
    this.enviados.push({ ...m, id });
    return { id };
  }
}

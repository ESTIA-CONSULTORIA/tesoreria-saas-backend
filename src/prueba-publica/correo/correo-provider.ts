// Puerto de correo saliente (docs/DISENO-PRUEBA-PUBLICA.md, D-PP-4). Solo el adaptador conoce URLs, llaves y formatos del proveedor;
// el resto del sistema no nombra a ninguno, así que cambiar de proveedor es cambiar de adaptador (variable CORREO_PROVIDER).

export interface MensajeCorreo {
  para: string;
  asunto: string;
  html: string;
  texto: string;
  /** El mismo valor nunca produce dos envíos (el proveedor lo respeta mientras dure su ventana de idempotencia). */
  claveIdempotencia: string;
}

export interface ResultadoEnvio {
  /** Identificador del mensaje en el proveedor (para soporte); no contiene datos personales. */
  id: string;
}

export type CodigoErrorCorreo = 'NO_CONFIGURADO' | 'RECHAZADO' | 'NO_DISPONIBLE';

/** Error ya traducido: nunca lleva el cuerpo crudo del proveedor (podría traer el correo del destinatario o la llave). */
export class CorreoError extends Error {
  constructor(
    public readonly codigo: CodigoErrorCorreo,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'CorreoError';
  }
}

export interface CorreoProvider {
  readonly nombre: string;
  enviar(mensaje: MensajeCorreo): Promise<ResultadoEnvio>;
}

// Token de inyección de Nest (las interfaces no existen en tiempo de ejecución).
export const CORREO_PROVIDER = Symbol('CORREO_PROVIDER');

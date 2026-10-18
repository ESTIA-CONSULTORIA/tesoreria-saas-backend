import { CorreoError, type CorreoProvider, type MensajeCorreo, type ResultadoEnvio } from './correo-provider';

// Adaptador de Resend (https://resend.com/docs/api-reference/emails/send-email): POST /emails con Bearer, `Idempotency-Key` y
// respuesta { id }. Variables: RESEND_API_KEY y CORREO_REMITENTE (p. ej. «ESTIA <prueba@mail.tudominio.com>», dominio ya verificado).
// PP0: escrito contra la documentación y probado SOLO con un fetch simulado; no se ha usado con una cuenta real (no hay cuenta).
export class ResendCorreoProvider implements CorreoProvider {
  readonly nombre = 'resend';

  constructor(
    private env: NodeJS.ProcessEnv = process.env,
    private http: typeof fetch = fetch,
    private tiempoMs = 10_000,
  ) {}

  async enviar(m: MensajeCorreo): Promise<ResultadoEnvio> {
    const llave = this.env.RESEND_API_KEY;
    const desde = this.env.CORREO_REMITENTE;
    if (!llave || !desde) throw new CorreoError('NO_CONFIGURADO', 'Falta RESEND_API_KEY o CORREO_REMITENTE.');
    if (!m.claveIdempotencia) throw new Error('claveIdempotencia es obligatoria');

    const ctrl = new AbortController();
    const reloj = setTimeout(() => ctrl.abort(), this.tiempoMs);
    try {
      const r = await this.http('https://api.resend.com/emails', {
        method: 'POST',
        signal: ctrl.signal,
        headers: { Authorization: `Bearer ${llave}`, 'Content-Type': 'application/json', 'Idempotency-Key': m.claveIdempotencia.slice(0, 256) },
        body: JSON.stringify({ from: desde, to: [m.para], subject: m.asunto, html: m.html, text: m.texto }),
      });
      // 4xx (salvo 429): el proveedor rechazó el mensaje, reintentar no sirve. 429 y 5xx: transitorio.
      if (r.status === 429 || r.status >= 500) throw new CorreoError('NO_DISPONIBLE', `El proveedor de correo no está disponible (HTTP ${r.status}).`);
      if (!r.ok) throw new CorreoError('RECHAZADO', `El proveedor de correo rechazó el mensaje (HTTP ${r.status}).`);
      const j: any = await r.json().catch(() => null);
      if (!j?.id || typeof j.id !== 'string') throw new CorreoError('NO_DISPONIBLE', 'Respuesta inesperada del proveedor de correo.');
      return { id: j.id };
    } catch (e) {
      if (e instanceof CorreoError) throw e;
      throw new CorreoError('NO_DISPONIBLE', 'No se pudo contactar al proveedor de correo.'); // red, timeout o abort: sin detalle crudo
    } finally {
      clearTimeout(reloj);
    }
  }
}

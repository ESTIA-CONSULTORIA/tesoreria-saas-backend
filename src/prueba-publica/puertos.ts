// Puertos de la prueba pública: lo externo (Turnstile y borrado físico, que vive en purgador-sql.ts; el correo vive en ./correo) entra por aquí y se prueba con dobles.

export const CAPTCHA_VERIFIER = Symbol('CAPTCHA_VERIFIER');
export interface CaptchaVerifier {
  verificar(token: string | undefined, ip: string): Promise<boolean>;
}

export const TENANT_PURGER = Symbol('TENANT_PURGER');
/** Bitácora de una purga: solo conteos por tabla, NUNCA datos personales. */
export interface ResultadoPurgaTenant {
  tablas: Record<string, number>;
  filas: number;
}
export interface TenantPurger {
  /**
   * Borra TODOS los datos del tenant (menos el registro de aceptación del aviso de privacidad, que vive en pruebas_publicas). Solo se invoca para
   * pruebas VENCIDAS (o FALLIDAS) con plan PRUEBA y pasada la retención; el purgador lo vuelve a comprobar por su cuenta. Todo o nada.
   */
  purgarTenant(tenantId: string, ahora?: Date): Promise<ResultadoPurgaTenant | void>;
}

// ── Adaptadores de PP0 ──

/** Cloudflare Turnstile (siteverify). Sin TURNSTILE_SECRET no valida nada (devuelve false): nunca deja pasar por omisión. */
export class TurnstileVerifier implements CaptchaVerifier {
  async verificar(token: string | undefined, ip: string): Promise<boolean> {
    const secret = process.env.TURNSTILE_SECRET;
    if (!secret || !token) return false;
    try {
      const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response: token, remoteip: ip }),
      });
      const j: any = await r.json();
      return j?.success === true;
    } catch {
      return false;
    }
  }
}


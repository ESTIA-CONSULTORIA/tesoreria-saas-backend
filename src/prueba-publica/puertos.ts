// Puertos de la prueba pública: lo externo (Turnstile y borrado físico; el correo vive en ./correo) entra por aquí y se prueba con dobles.

export const CAPTCHA_VERIFIER = Symbol('CAPTCHA_VERIFIER');
export interface CaptchaVerifier {
  verificar(token: string | undefined, ip: string): Promise<boolean>;
}

export const TENANT_PURGER = Symbol('TENANT_PURGER');
export interface TenantPurger {
  /** Borra TODOS los datos del tenant. Solo se invoca para pruebas VENCIDAS con plan PRUEBA y pasada la retención. */
  purgarTenant(tenantId: string): Promise<void>;
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

/** PP0: el borrado físico llega con PP3. Falla ruidosamente en lugar de fingir que borró. */
export class PurgadorPendiente implements TenantPurger {
  async purgarTenant(): Promise<void> {
    throw new Error('La purga física de un tenant de prueba se implementa en PP3.');
  }
}

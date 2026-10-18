import { Logger } from '@nestjs/common';

// Puertos de la prueba pública: lo externo (Turnstile, correo, borrado físico) entra por aquí y se prueba con dobles.

export const CAPTCHA_VERIFIER = Symbol('CAPTCHA_VERIFIER');
export interface CaptchaVerifier {
  verificar(token: string | undefined, ip: string): Promise<boolean>;
}

export const CORREO_PRUEBA = Symbol('CORREO_PRUEBA');
export interface CorreoPrueba {
  /** Envía el enlace de activación. El token NUNCA se escribe en logs. */
  enviarEnlace(correo: string, token: string, nombre: string): Promise<void>;
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

/** PP0: no hay proveedor de correo (D-PP-4). Solo deja constancia de que habría enviado, sin correo ni token. */
export class CorreoSinProveedor implements CorreoPrueba {
  private log = new Logger('PruebaPublica');
  async enviarEnlace(): Promise<void> {
    this.log.warn('Enlace de prueba generado pero NO enviado: aún no hay proveedor de correo configurado (PP1).');
  }
}

/** PP0: el borrado físico llega con PP3. Falla ruidosamente en lugar de fingir que borró. */
export class PurgadorPendiente implements TenantPurger {
  async purgarTenant(): Promise<void> {
    throw new Error('La purga física de un tenant de prueba se implementa en PP3.');
  }
}

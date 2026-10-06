import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

// Límite de intentos FALLIDOS de NIP del POS Lite. Reemplaza el @Throttle por IP (5 / 15 min), que en un
// restaurante con varias tabletas detrás de la misma IP (o detrás del proxy, que presenta una sola IP) las
// bloqueaba entre sí. Cuenta solo fallos, por varias llaves a la vez:
//   · tenant + IP                → 10 fallos / 15 min   (tabletas de un local no se bloquean por un par de errores)
//   · tenant (todas las IPs)     → 40 fallos / 15 min   (tope contra fuerza bruta distribuida del NIP de 4 dígitos)
//   · tenant + usuario + IP      →  5 fallos / 15 min   (solo si el cliente indica el usuario)
//   · tenant + usuario           → 10 fallos / 15 min
// Un login correcto limpia los contadores de IP del usuario; el tope por tenant no se limpia.
// En memoria (una instancia del backend): se reinicia con cada deploy.
export const NIP_WINDOW_MS = 15 * 60 * 1000;
export const NIP_LIMITS = { tenantIp: 10, tenant: 40, userIp: 5, user: 10 };

type Entry = { count: number; resetAt: number };

@Injectable()
export class NipThrottleService {
  private entries = new Map<string, Entry>();
  now: () => number = () => Date.now();

  private keys(tenantId: string | undefined, userId: string | undefined, ip: string) {
    const t = tenantId || 'sin-tenant';
    const llaves: Array<[string, number]> = [
      [`t|${t}|ip|${ip}`, NIP_LIMITS.tenantIp],
      [`t|${t}`, NIP_LIMITS.tenant],
    ];
    if (userId) {
      llaves.push([`u|${t}|${userId}|ip|${ip}`, NIP_LIMITS.userIp], [`u|${t}|${userId}`, NIP_LIMITS.user]);
    }
    return llaves;
  }

  private live(key: string): Entry | undefined {
    const e = this.entries.get(key);
    if (e && e.resetAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return e;
  }

  // Lanza 429 si alguna llave ya llegó a su tope.
  assertAllowed(tenantId: string | undefined, userId: string | undefined, ip: string): void {
    for (const [key, max] of this.keys(tenantId, userId, ip)) {
      const e = this.live(key);
      if (e && e.count >= max) {
        const minutos = Math.max(1, Math.ceil((e.resetAt - this.now()) / 60000));
        throw new HttpException(`Demasiados intentos fallidos de NIP. Intenta de nuevo en ${minutos} min.`, HttpStatus.TOO_MANY_REQUESTS);
      }
    }
  }

  registerFailure(tenantId: string | undefined, userId: string | undefined, ip: string): void {
    for (const [key] of this.keys(tenantId, userId, ip)) {
      const e = this.live(key);
      if (e) e.count += 1;
      else this.entries.set(key, { count: 1, resetAt: this.now() + NIP_WINDOW_MS });
    }
  }

  registerSuccess(tenantId: string | undefined, userId: string | undefined, ip: string): void {
    const t = tenantId || 'sin-tenant';
    this.entries.delete(`t|${t}|ip|${ip}`);
    if (userId) {
      this.entries.delete(`u|${t}|${userId}|ip|${ip}`);
      this.entries.delete(`u|${t}|${userId}`);
    }
  }
}

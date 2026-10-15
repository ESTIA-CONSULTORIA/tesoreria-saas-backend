import { BadRequestException } from '@nestjs/common';

// Formas de pago con tarjeta: en todas el cobro exige los últimos 4 dígitos (exactamente 4, solo números).
export const FORMAS_TARJETA = ['DEBITO', 'CREDITO', 'TARJETA'];

export const esFormaTarjeta = (forma: unknown): boolean => FORMAS_TARJETA.includes(String(forma));

// Devuelve los 4 dígitos normalizados o lanza 400 con un mensaje que dice qué falta. `donde` ubica el pago en el mensaje
// ("Forma de pago 2", "El cobro con tarjeta"…).
export function exigirUltimos4(forma: unknown, valor: unknown, donde = 'El pago con tarjeta'): string {
  const v = typeof valor === 'string' || typeof valor === 'number' ? String(valor).trim() : '';
  if (!v) {
    throw new BadRequestException(`${donde} (${forma}) requiere los últimos 4 dígitos de la tarjeta (ultimos4Digitos).`);
  }
  if (!/^\d{4}$/.test(v)) {
    throw new BadRequestException(`${donde} (${forma}): los últimos 4 dígitos deben ser exactamente 4 números (recibido: "${v.slice(0, 12)}").`);
  }
  return v;
}

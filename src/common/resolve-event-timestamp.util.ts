import { BadRequestException } from '@nestjs/common';

// Prerequisito de fondo para modo offline (POS/Corte de caja): permite que el backend
// respete la hora REAL en que ocurrió un evento (venta, apertura/cierre de turno) en vez
// de siempre usar la hora de llegada al servidor. Retrocompatible: si no viene
// clientTimestamp, se comporta exactamente igual que antes (new Date() del servidor).
//
// Rango de tolerancia (decisión de negocio, no ajustar sin confirmar):
//   - Futuro: unos minutos, solo para cubrir desfase normal de reloj de dispositivo.
//   - Pasado: 48 horas, cubre una ventana de sincronización offline razonable sin abrir
//     la puerta a manipular reportes con fechas arbitrariamente viejas.
const MAX_FUTURE_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutos
const MAX_PAST_TOLERANCE_MS = 48 * 60 * 60 * 1000; // 48 horas

/**
 * Resuelve la fecha/hora real de un evento. Si `clientTimestamp` viene y es válido (dentro
 * del rango de tolerancia), se usa. Si no viene, se usa la hora del servidor (comportamiento
 * de siempre). Debe llamarse FUERA de cualquier try/catch que envuelva el error genérico del
 * método que la invoca — un BadRequestException aquí debe llegar al cliente como 400, no
 * quedar enmascarado como 500 por un catch que lo re-envuelve en un Error plano.
 */
export function resolveEventTimestamp(clientTimestamp?: string | Date): Date {
  if (!clientTimestamp) return new Date();

  const parsed = new Date(clientTimestamp);
  if (isNaN(parsed.getTime())) {
    throw new BadRequestException('clientTimestamp inválido');
  }

  const now = new Date();
  const diffMs = parsed.getTime() - now.getTime();

  if (diffMs > MAX_FUTURE_TOLERANCE_MS) {
    throw new BadRequestException('clientTimestamp no puede estar en el futuro');
  }
  if (diffMs < -MAX_PAST_TOLERANCE_MS) {
    throw new BadRequestException('clientTimestamp no puede tener más de 48 horas de antigüedad');
  }

  return parsed;
}

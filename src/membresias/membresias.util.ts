import { createHmac } from 'crypto';

// Lógica pura de membresías (fechas, vigencia, NIP): sin base de datos, para probarla con specs.
// Las vigencias son FECHAS (YYYY-MM-DD), no instantes: "vence el 15" significa que el 15 todavía entra.

export type PeriodoTipo = 'DIAS' | 'MESES' | 'ANOS';

// Zona horaria del negocio para decidir "hoy" (Railway corre en UTC: sin esto, de 5 pm a medianoche en Tijuana "hoy" ya sería
// mañana). Configurable por entorno; el default es el de los clientes actuales.
export const ZONA_HORARIA = process.env.APP_TIMEZONE || 'America/Tijuana';

export function hoyLocal(ahora: Date = new Date(), zona: string = ZONA_HORARIA): string {
  // en-CA formatea como YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
}

const aUtc = (ymd: string): Date => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const deUtc = (dt: Date): string => dt.toISOString().slice(0, 10);

export function sumarDias(ymd: string, n: number): string {
  const d = aUtc(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return deUtc(d);
}

// Suma meses sin desbordar: 31 de enero + 1 mes = 28/29 de febrero (no 3 de marzo).
export function sumarMeses(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const total = (m - 1) + n;
  const anio = y + Math.floor(total / 12);
  const mes = ((total % 12) + 12) % 12;
  const ultimo = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  return deUtc(new Date(Date.UTC(anio, mes, Math.min(d, ultimo))));
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aUtc(hasta).getTime() - aUtc(desde).getTime()) / 86_400_000);
}

// Último día incluido del periodo que empieza en `inicio`: un mes desde el 1 de enero termina el 31; desde el 15, el 14 del
// siguiente. Los periodos consecutivos no se traslapan ni dejan huecos.
export function finDePeriodo(inicio: string, tipo: PeriodoTipo, cantidad: number): string {
  const siguiente = tipo === 'DIAS' ? sumarDias(inicio, cantidad) : sumarMeses(inicio, tipo === 'MESES' ? cantidad : cantidad * 12);
  return sumarDias(siguiente, -1);
}

export type EstadoEfectivo = 'ACTIVA' | 'CONGELADA' | 'PROGRAMADA' | 'VENCIDA' | 'CANCELADA';

export interface PeriodoMembresia {
  estado: 'ACTIVA' | 'CONGELADA' | 'CANCELADA';
  fechaInicio: string;
  fechaFin: string;
}

export function estadoEfectivo(m: PeriodoMembresia, hoy: string): EstadoEfectivo {
  if (m.estado === 'CANCELADA') return 'CANCELADA';
  if (m.fechaFin < hoy && m.estado === 'ACTIVA') return 'VENCIDA';
  if (m.fechaInicio > hoy) return 'PROGRAMADA';
  return m.estado;
}

// ¿Vigente hoy? Dentro de sus fechas y no cancelada. Una congelada NO deja entrar (está en pausa).
export const vigenteHoy = (m: PeriodoMembresia, hoy: string): boolean =>
  m.estado === 'ACTIVA' && m.fechaInicio <= hoy && hoy <= m.fechaFin;

export interface SituacionSocio {
  estado: 'VIGENTE' | 'CONGELADA' | 'PROGRAMADA' | 'VENCIDA' | 'SIN_MEMBRESIA';
  // el periodo que explica el estado (el vigente, el congelado, el próximo, o el último que venció)
  periodo?: PeriodoMembresia & { id?: string };
  // vigente: días que le quedan (0 = vence hoy). vencida: días que lleva vencida.
  dias?: number;
}

// La situación de un socio a partir de sus periodos (los cancelados no cuentan).
export function situacionDeSocio<T extends PeriodoMembresia>(periodos: T[], hoy: string): SituacionSocio & { periodo?: T } {
  const vivos = periodos.filter((p) => p.estado !== 'CANCELADA');
  const vigente = vivos.filter((p) => vigenteHoy(p, hoy)).sort((a, b) => (a.fechaFin < b.fechaFin ? 1 : -1))[0];
  if (vigente) return { estado: 'VIGENTE', periodo: vigente, dias: diasEntre(hoy, vigente.fechaFin) };
  const congelada = vivos.find((p) => p.estado === 'CONGELADA' && p.fechaInicio <= hoy);
  if (congelada) return { estado: 'CONGELADA', periodo: congelada };
  const proxima = vivos.filter((p) => p.fechaInicio > hoy).sort((a, b) => (a.fechaInicio < b.fechaInicio ? -1 : 1))[0];
  if (proxima) return { estado: 'PROGRAMADA', periodo: proxima, dias: diasEntre(hoy, proxima.fechaInicio) };
  const ultima = vivos.sort((a, b) => (a.fechaFin < b.fechaFin ? 1 : -1))[0];
  if (ultima) return { estado: 'VENCIDA', periodo: ultima, dias: diasEntre(ultima.fechaFin, hoy) };
  return { estado: 'SIN_MEMBRESIA' };
}

// Desde cuándo empieza un periodo nuevo para un socio que paga hoy: si todavía tiene vigencia, a continuación de la última
// fecha que ya pagó; si no, hoy. Así renovar antes de tiempo no regala ni pierde días.
export function inicioDeRenovacion(periodos: PeriodoMembresia[], hoy: string): string {
  const finMax = periodos
    .filter((p) => p.estado !== 'CANCELADA')
    .reduce<string | null>((max, p) => (max === null || p.fechaFin > max ? p.fechaFin : max), null);
  return finMax !== null && finMax >= hoy ? sumarDias(finMax, 1) : hoy;
}

export const NIP_VALIDO = /^\d{4,6}$/;

// NIP del socio: HMAC con la llave del servidor y el tenant (no bcrypt, para poder buscar por igualdad en el check-in y
// garantizar que sea único por negocio). Un NIP es un código de entrada de bajo riesgo, no una contraseña.
export function hashNip(tenantId: string, nip: string, llave: string = process.env.JWT_SECRET || 'dev-membresias'): string {
  return createHmac('sha256', llave).update(`${tenantId}:${nip}`).digest('hex');
}

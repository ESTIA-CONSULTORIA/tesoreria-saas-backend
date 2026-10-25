import { BadRequestException } from '@nestjs/common';

export const ESTADOS_SOLICITUD = ['PENDIENTE', 'APROBADA', 'RECHAZADA'] as const;
export const LIMITE_POR_DEFECTO = 25;
export const LIMITE_MAXIMO = 100;

export interface FiltrosSolicitudes {
  /** undefined = todos los estados. */
  estado?: (typeof ESTADOS_SOLICITUD)[number];
  desde?: string;
  hasta?: string;
  employeeId?: string;
  page: number;
  limit: number;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function fechaValida(v: string): boolean {
  if (!FECHA.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
}

function entero(nombre: string, v: unknown, def: number, min: number, max: number): number {
  if (v === undefined || v === null || v === '') return def;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new BadRequestException(`${nombre} debe ser un entero entre ${min} y ${max}`);
  }
  return n;
}

/** Valida el query string de GET /hr/requests/pending. Sin parámetros = pendientes, página 1, 25 por página. */
export function parseFiltrosSolicitudes(q: Record<string, any> = {}): FiltrosSolicitudes {
  const estadoRaw = String(q.estado ?? 'PENDIENTE').trim().toUpperCase();
  let estado: FiltrosSolicitudes['estado'];
  if (estadoRaw === 'TODAS' || estadoRaw === 'TODOS') estado = undefined;
  else if ((ESTADOS_SOLICITUD as readonly string[]).includes(estadoRaw)) estado = estadoRaw as FiltrosSolicitudes['estado'];
  else throw new BadRequestException(`estado debe ser ${ESTADOS_SOLICITUD.join(', ')} o TODAS`);

  const desde = q.desde ? String(q.desde).trim() : undefined;
  const hasta = q.hasta ? String(q.hasta).trim() : undefined;
  if (desde && !fechaValida(desde)) throw new BadRequestException('desde debe tener formato YYYY-MM-DD');
  if (hasta && !fechaValida(hasta)) throw new BadRequestException('hasta debe tener formato YYYY-MM-DD');
  if (desde && hasta && desde > hasta) throw new BadRequestException('desde no puede ser posterior a hasta');

  const employeeId = q.employeeId ? String(q.employeeId).trim() : undefined;

  return {
    estado,
    desde,
    hasta,
    employeeId,
    page: entero('page', q.page, 1, 1, 100000),
    limit: entero('limit', q.limit, LIMITE_POR_DEFECTO, 1, LIMITE_MAXIMO),
  };
}

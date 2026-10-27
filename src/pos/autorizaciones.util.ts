import { createHash, randomBytes } from 'crypto';

// Autorización de cortesías y de descuentos sobre el tope del rol. Un gerente o administrador pone su contraseña ERP en la caja
// de otro (cajero, capitán, recepción) y el servidor entrega un token de UN SOLO USO, de 2 minutos, ligado al negocio, a quien lo
// pidió, al motivo y a las líneas exactas del ticket. Aquí solo viven las reglas puras (con spec).

export type TipoAutorizacion = 'CORTESIA' | 'DESCUENTO';

export const TTL_AUTORIZACION_MS = 2 * 60 * 1000;

// Motivos cerrados: el servidor responde 400 si falta o no es uno de estos.
export const MOTIVOS_CORTESIA = ['cortesia_ejecutiva', 'error_pedido', 'cliente_vip', 'cumpleanos', 'compensacion_queja', 'otro'];
export const MOTIVOS_DESCUENTO = ['promocion', 'cliente_frecuente', 'error_cobro', 'autorizacion_gerencia', 'otro'];

export const motivosDe = (tipo: TipoAutorizacion): string[] => (tipo === 'CORTESIA' ? MOTIVOS_CORTESIA : MOTIVOS_DESCUENTO);
export const motivoValido = (tipo: TipoAutorizacion, motivo: unknown): motivo is string => typeof motivo === 'string' && motivosDe(tipo).includes(motivo);

const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

// Líneas del ticket que ligan la autorización: producto, cantidad y descuento. El precio lo pone el servidor, así que no entra.
// Cambiar una cantidad, un descuento o agregar/quitar un producto invalida la autorización.
export function hashLineas(items: Array<{ productoId?: unknown; cantidad?: unknown; descuento?: unknown }>): string {
  const lineas = (Array.isArray(items) ? items : []).map((i) => [String(i?.productoId ?? ''), round2(Number(i?.cantidad)), round2(Number(i?.descuento ?? 0))]);
  return sha256('lineas:' + JSON.stringify(lineas));
}

// Descuento sobre una cuenta abierta (PUT /pos/sales/:id/discount): ligado a la cuenta y al importe del descuento.
export function hashCuenta(ventaId: string, descuento: number): string {
  return sha256('cuenta:' + JSON.stringify([String(ventaId), round2(descuento)]));
}

// El token viaja una sola vez al cliente; en la base solo queda su hash.
export function nuevoToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}
export const hashToken = (token: string): string => sha256('pos-autorizacion:' + token);

export interface AutorizacionUsable {
  tipo: TipoAutorizacion;
  motivo: string;
  autorizadoPorId: string;
  autorizadoPorEmail: string;
  autorizadoPorRol: string;
}

// Una cortesía cubre cualquier descuento; una autorización de descuento no cubre el 100 % (eso es cortesía).
export const cubreCortesia = (a?: AutorizacionUsable | null): boolean => a?.tipo === 'CORTESIA';
export const cubreDescuento = (a: AutorizacionUsable | null | undefined, pct: number): boolean => !!a && (a.tipo === 'CORTESIA' || pct < 100);

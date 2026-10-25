import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

// PIN del acceso ejecutivo (/auth/executive-login). Antes no tenía validación alguna: había PIN de 4 dígitos (10 000 combinaciones)
// y dos usuarios del mismo tenant con el mismo PIN, con lo que el login entraba como el primero que coincidiera.
export const PIN_EJECUTIVO_MIN = 6;
export const PIN_EJECUTIVO_MAX = 12;

/** Devuelve el motivo si el PIN no es válido (solo dígitos, 6 a 12), o null si lo es. */
export function errorPinEjecutivo(pin: unknown): string | null {
  if (typeof pin !== 'string' || !/^[0-9]+$/.test(pin) || pin.length < PIN_EJECUTIVO_MIN || pin.length > PIN_EJECUTIVO_MAX) {
    return `El PIN ejecutivo debe tener entre ${PIN_EJECUTIVO_MIN} y ${PIN_EJECUTIVO_MAX} dígitos, solo números.`;
  }
  return null;
}

export interface UsuarioConPin {
  id: string;
  executivePin?: string | null;
}

/** true si algún OTRO usuario (excluirUserId) ya tiene ese PIN. Compara contra el hash bcrypt de cada uno. */
export async function pinEjecutivoEnUso(usuarios: UsuarioConPin[], pin: string, excluirUserId?: string): Promise<boolean> {
  for (const u of usuarios) {
    if (u.id === excluirUserId || !u.executivePin) continue;
    if (await bcrypt.compare(pin, u.executivePin)) return true;
  }
  return false;
}

/** Valida formato y, si hay tenant, que no lo use otro usuario del mismo tenant. Lanza 400 con mensaje genérico de colisión. */
export async function assertPinEjecutivoValido(
  pin: string,
  usuariosDelTenant: UsuarioConPin[] | null,
  excluirUserId?: string,
): Promise<void> {
  const motivo = errorPinEjecutivo(pin);
  if (motivo) throw new BadRequestException(motivo);
  if (usuariosDelTenant && (await pinEjecutivoEnUso(usuariosDelTenant, pin, excluirUserId))) {
    throw new BadRequestException('Ese PIN ya lo usa otro usuario del negocio. Elige uno distinto.');
  }
}

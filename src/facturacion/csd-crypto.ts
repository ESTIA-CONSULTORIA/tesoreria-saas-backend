import * as crypto from 'crypto';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ENCRYPTION_KEY_MIN_LENGTH } from '../integrations/integrations.service';

// Cifrado de secretos fiscales (CSD: .key y su contraseña) — DISENO-CFDI-40.md §2.3.
// Formato versionado y AUTENTICADO:  v2:gcm:<keyId>:<iv>:<tag>:<texto>   (AES-256-GCM, IV de 12 bytes aleatorio por valor).
//  · keyId = primeros 8 hex de sha256(llave): permite rotar ENCRYPTION_KEY sin re-cifrar todo de golpe. La llave anterior se
//    deja en ENCRYPTION_KEY_PREVIOUS (varias, separadas por coma) mientras se re-cifra; descifrar usa la que corresponda al keyId.
//  · El contexto (p. ej. «tenantId|companyId|key») va como datos autenticados: un valor copiado a otra empresa/tenant o a otro
//    campo NO descifra, aunque la llave sea la misma.
//  · Si ENCRYPTION_KEY falta o es corta, no se puede guardar ni usar un CSD: error claro, el backend no cae.

const PREFIJO = 'v2:gcm:';

const hashLlave = (k: string) => crypto.createHash('sha256').update(k).digest();
export const idLlave = (k: string) => hashLlave(k).toString('hex').slice(0, 8);

function llaveVigente(): string {
  const k = process.env.ENCRYPTION_KEY;
  if (!k || k.length < ENCRYPTION_KEY_MIN_LENGTH) {
    throw new InternalServerErrorException(
      `ENCRYPTION_KEY no está configurada o tiene menos de ${ENCRYPTION_KEY_MIN_LENGTH} caracteres: no se puede guardar ni usar un CSD. Defínela en el entorno del servidor.`,
    );
  }
  return k;
}

function llavePorId(id: string): string | null {
  const candidatas = [process.env.ENCRYPTION_KEY, ...(process.env.ENCRYPTION_KEY_PREVIOUS ?? '').split(',')]
    .map((s) => (s ?? '').trim())
    .filter((s) => s.length >= ENCRYPTION_KEY_MIN_LENGTH);
  return candidatas.find((k) => idLlave(k) === id) ?? null;
}

export function cifrarSecreto(texto: string, contexto: string): string {
  const llave = llaveVigente();
  const iv = crypto.randomBytes(12);
  const cifrador = crypto.createCipheriv('aes-256-gcm', hashLlave(llave), iv);
  cifrador.setAAD(Buffer.from(contexto, 'utf8'));
  const ct = Buffer.concat([cifrador.update(texto, 'utf8'), cifrador.final()]);
  return `${PREFIJO}${idLlave(llave)}:${iv.toString('hex')}:${cifrador.getAuthTag().toString('hex')}:${ct.toString('hex')}`;
}

export function descifrarSecreto(valor: string, contexto: string): string {
  llaveVigente(); // sin llave configurada: error claro, no un «no se pudo descifrar» genérico
  if (typeof valor !== 'string' || !valor.startsWith(PREFIJO)) throw new BadRequestException('El secreto guardado no tiene un formato reconocido.');
  const [id, ivHex, tagHex, ctHex] = valor.slice(PREFIJO.length).split(':');
  if (!id || !ivHex || !tagHex || !ctHex) throw new BadRequestException('El secreto guardado está incompleto.');
  const llave = llavePorId(id);
  if (!llave) {
    throw new InternalServerErrorException('El secreto fue cifrado con una llave que ya no está configurada. Restaura ENCRYPTION_KEY (o ENCRYPTION_KEY_PREVIOUS) y reintenta.');
  }
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', hashLlave(llave), Buffer.from(ivHex, 'hex'));
    d.setAAD(Buffer.from(contexto, 'utf8'));
    d.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([d.update(Buffer.from(ctHex, 'hex')), d.final()]).toString('utf8');
  } catch {
    // Sin detalle a propósito: no distinguir «contexto distinto» de «alterado».
    throw new InternalServerErrorException('No se pudo descifrar el secreto (alterado o de otro negocio).');
  }
}

/** ¿Este valor ya está en el formato v2 con la llave vigente? (para decidir re-cifrado durante una rotación) */
export const estaCifradoConLlaveVigente = (valor: string) => typeof valor === 'string' && valor.startsWith(`${PREFIJO}${idLlave(llaveVigente())}:`);

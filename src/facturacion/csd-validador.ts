import { X509Certificate, createPrivateKey } from 'crypto';

// Validación local de un CSD (.cer + .key + contraseña) antes de guardarlo — DISENO-CFDI-40.md §2.3 regla 4.
// Puro: no toca BD ni red. Nunca devuelve ni registra la llave ni la contraseña.

export interface CsdInspeccionado {
  numeroCertificado: string;
  rfc: string;
  vigenteDesde: Date;
  vigenteHasta: Date;
  cerPem: string; // el certificado es público: se guarda sin cifrar
}

export type ResultadoCsd = { ok: true; csd: CsdInspeccionado; advertencias: string[] } | { ok: false; errores: string[] };

const aBuffer = (b64: unknown): Buffer | null => {
  if (typeof b64 !== 'string' || !b64.trim()) return null;
  const limpio = b64.replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
  return /^[A-Za-z0-9+/]+={0,2}$/.test(limpio) ? Buffer.from(limpio, 'base64') : null;
};

// El SAT escribe el RFC en x500UniqueIdentifier ("RFC / CURP"); el número de certificado es la serie del certificado leída como ASCII (20 dígitos).
function rfcDelSujeto(subject: string): string | null {
  const m = subject.match(/x500UniqueIdentifier=([^\n]+)/i);
  return m ? m[1].split('/')[0].trim().toUpperCase() : null;
}
function numeroDeSerie(serieHex: string): { numero: string; ascii: boolean } {
  const ascii = Buffer.from(serieHex, 'hex').toString('latin1');
  return /^\d{20}$/.test(ascii) ? { numero: ascii, ascii: true } : { numero: serieHex.toUpperCase(), ascii: false };
}

export function inspeccionarCsd(entrada: { cerB64: unknown; keyB64: unknown; password: unknown; rfcEmpresa: string; ahora?: Date }): ResultadoCsd {
  const errores: string[] = [];
  const advertencias: string[] = [];
  const ahora = entrada.ahora ?? new Date();

  const cerBuf = aBuffer(entrada.cerB64);
  const keyBuf = aBuffer(entrada.keyB64);
  if (!cerBuf) errores.push('Falta el archivo .cer (certificado) o no está en base64.');
  if (!keyBuf) errores.push('Falta el archivo .key (llave privada) o no está en base64.');
  if (typeof entrada.password !== 'string' || !entrada.password) errores.push('Falta la contraseña de la llave privada.');
  if (errores.length) return { ok: false, errores };

  let cert: X509Certificate;
  try {
    cert = new X509Certificate(cerBuf as Buffer);
  } catch {
    return { ok: false, errores: ['El archivo .cer no es un certificado válido.'] };
  }

  const rfc = rfcDelSujeto(cert.subject);
  if (!rfc) errores.push('El certificado no trae el RFC del contribuyente.');
  else if (rfc !== entrada.rfcEmpresa.toUpperCase()) errores.push(`El RFC del certificado (${rfc}) no es el de la empresa (${entrada.rfcEmpresa.toUpperCase()}).`);

  const desde = new Date(cert.validFrom);
  const hasta = new Date(cert.validTo);
  if (hasta.getTime() <= ahora.getTime()) errores.push(`El certificado venció el ${hasta.toISOString().slice(0, 10)}.`);
  else if (desde.getTime() > ahora.getTime()) errores.push(`El certificado todavía no es vigente (empieza el ${desde.toISOString().slice(0, 10)}).`);
  else if (hasta.getTime() - ahora.getTime() < 30 * 86_400_000) advertencias.push(`El certificado vence pronto (${hasta.toISOString().slice(0, 10)}).`);

  let llave;
  try {
    llave = createPrivateKey({ key: keyBuf as Buffer, format: 'der', type: 'pkcs8', passphrase: entrada.password as string });
  } catch {
    errores.push('La contraseña no abre la llave privada (o el archivo .key no es válido).');
  }
  if (llave && !cert.checkPrivateKey(llave)) errores.push('La llave privada (.key) no corresponde al certificado (.cer).');

  if (errores.length) return { ok: false, errores };

  const { numero, ascii } = numeroDeSerie(cert.serialNumber);
  if (!ascii) advertencias.push('El número de certificado no tiene el formato de 20 dígitos del SAT: confirma que sea un CSD y no otro tipo de certificado.');
  return {
    ok: true,
    advertencias,
    csd: { numeroCertificado: numero, rfc: rfc as string, vigenteDesde: desde, vigenteHasta: hasta, cerPem: cert.toString() },
  };
}

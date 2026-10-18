// La bitácora (audit_log) guarda el cuerpo de cada POST/PUT/PATCH/DELETE. Los secretos NUNCA deben quedar ahí: contraseñas, NIP,
// tokens, llaves, certificados y credenciales de integraciones. Se enmascaran por NOMBRE de campo, a cualquier profundidad.

const SECRETO = /(pass(word|phrase)?|contrase|(nip|pin)$|secret|token|api[-_]?key|authorization|credential|key(b64|cifrado)?$|cer(b64)?$|csd|private|clave(?!prodserv|unidad)|otp|cvv|cvc)/i;
export const MASCARA = '[REDACTADO]';

export function redactar(valor: unknown, profundidad = 0): unknown {
  if (valor === null || typeof valor !== 'object') return valor;
  if (profundidad > 8) return MASCARA; // estructuras absurdamente anidadas: mejor no guardar nada
  if (Array.isArray(valor)) return valor.map((v) => redactar(v, profundidad + 1));
  const salida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
    salida[k] = SECRETO.test(k) ? MASCARA : redactar(v, profundidad + 1);
  }
  return salida;
}

// La URL también puede llevar secretos en la consulta (?token=…).
export function redactarUrl(url: string): string {
  return typeof url === 'string' ? url.replace(/([?&](?:token|access_token|key|password|nip|pin|secret)=)[^&]*/gi, `$1${MASCARA}`) : url;
}

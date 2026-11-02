// Negocio al que se atribuye una entrada de la bitácora.
//
// Un usuario de un negocio queda registrado con el tenantId de su token, y así su ADMIN ve lo que pasa en SU negocio. SOPORTE no
// pertenece a ningún negocio: antes todas sus acciones quedaban con tenantId 'system', y el ADMIN del negocio afectado no veía que
// SOPORTE había tocado sus datos. Ahora, si quien actúa es SOPORTE, el registro lleva el negocio OBJETIVO de la acción:
//   1. ?tenantId= de la petición (el selector de negocio del frontend lo manda en cada llamada),
//   2. body.tenantId (altas de usuarios, empresas…),
//   3. el tenantId de la respuesta (rutas por id: editar o borrar un usuario, una sucursal…).
// Solo se acepta un UUID, y SOLO si quien actúa es SOPORTE: para cualquier otro rol manda el token (si no, un usuario podría escribir
// entradas en la bitácora de otro negocio mandando ?tenantId=).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const valido = (v: unknown): v is string => typeof v === 'string' && UUID.test(v.trim());

export type OrigenNegocio = 'token' | 'query' | 'body' | 'respuesta' | 'sistema';

export function negocioDeLaBitacora(i: {
  roleCode?: string | null;
  tenantIdToken?: string | null;
  query?: any;
  body?: any;
  respuesta?: any;
}): { tenantId: string; origen: OrigenNegocio } {
  if (i.tenantIdToken) return { tenantId: i.tenantIdToken, origen: 'token' };
  if (i.roleCode === 'SOPORTE') {
    if (valido(i.query?.tenantId)) return { tenantId: String(i.query.tenantId).trim(), origen: 'query' };
    if (valido(i.body?.tenantId)) return { tenantId: String(i.body.tenantId).trim(), origen: 'body' };
    if (valido(i.respuesta?.tenantId)) return { tenantId: String(i.respuesta.tenantId).trim(), origen: 'respuesta' };
  }
  return { tenantId: 'system', origen: 'sistema' };
}

// '/api/v1/users/abc?x=1' -> 'User'. Antes tomaba el primer segmento de la URL, que es 'api': el 99 % de las entradas
// quedaban con entidad 'Api' y el filtro por entidad de la bitácora no servía.
export function entidadDeLaUrl(url: string): string {
  const ruta = String(url || '').split('?')[0];
  const partes = ruta.split('/').filter(Boolean).filter((p) => !/^api$/i.test(p) && !/^v\d+$/i.test(p));
  if (!partes.length) return 'Unknown';
  const e = partes[0].charAt(0).toUpperCase() + partes[0].slice(1);
  if (e.endsWith('ies')) return e.slice(0, -3) + 'y';
  if (e.endsWith('es')) return e.slice(0, -2);
  if (e.endsWith('s')) return e.slice(0, -1);
  return e;
}

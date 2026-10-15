// Registro en el log del servidor de un cobro rechazado con 4xx: el cliente ya recibe el mensaje, pero Railway solo guarda
// método, ruta y status; sin esto soporte no puede saber POR QUÉ se rechazó una venta. Solo datos operativos: nada de
// dígitos de tarjeta, claves de rastreo, folios de voucher ni datos de personas.

export function mensajeDeRechazo(e: any): string {
  const r = typeof e?.getResponse === 'function' ? e.getResponse() : undefined;
  const m = typeof r === 'string' ? r : r?.message ?? e?.message;
  return Array.isArray(m) ? m.join('. ') : String(m ?? 'sin mensaje');
}

export function resumenCobro(data: any): string {
  const pagos = Array.isArray(data?.formasPago) ? data.formasPago : data?.formaPago ? [{ forma: data.formaPago, monto: data.monto ?? data.montoRecibido }] : [];
  const formas = pagos.map((p: any) => `${String(p?.forma).slice(0, 14)}:${Number(p?.monto)}`).join(',') || '-';
  const items = Array.isArray(data?.items) ? data.items.length : 0;
  return `formas=[${formas}] items=${items} totalCliente=${Number(data?.total)}`;
}

export function registrarRechazo(ruta: string, e: any, req: any, data: any, log: (m: string) => void = (m) => console.warn(m)): void {
  const status = typeof e?.getStatus === 'function' ? e.getStatus() : 500;
  if (status < 400 || status >= 500) return; // los 5xx ya los registra quien los lanza
  log(
    `[${ruta}] ${status} ${mensajeDeRechazo(e)} | tenant=${req?.user?.tenantId ?? req?.tenantId ?? '-'} usuario=${req?.user?.id ?? '-'} ` +
      `rol=${req?.user?.roleCode ?? '-'} sucursal=${data?.sucursalId ?? '-'} folio=${data?.folio ?? '-'} ${resumenCobro(data)}`,
  );
}

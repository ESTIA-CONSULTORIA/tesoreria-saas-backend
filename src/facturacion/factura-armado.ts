import type { SaleItem } from '../pos/entities/sale.entity';
import { tasaNumerica, isValidTasaIva, DEFAULT_TASA_IVA, type TasaIva } from '../config/iva.config';
import type { CfdiEntrada, ConceptoEntrada, ImpuestoConcepto } from './pac/pac.types';
import { validarRfc } from './fiscal-validators';

// Armado de CfdiEntrada a partir de una venta (DISENO-CFDI-40.md §3.2) y de una nota de crédito a partir de una factura (§3.5).
// PURO y con spec: no toca BD ni red. Todo lo que devuelve es SIN validez fiscal hasta que exista timbrado real.

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r6 = (n: number) => Math.round((n + Number.EPSILON) * 1e6) / 1e6;

/** Diferencia máxima tolerada entre el total de la venta y el que resulta de sumar el IVA por concepto (D-10, redondeo). */
export const TOLERANCIA_REDONDEO = 0.05;

// [VALIDAR D-04] Forma de pago SAT por forma de pago del POS. En pago mixto se usa la de mayor monto.
const FORMA_PAGO_SAT: Record<string, string> = { EFECTIVO: '01', TRANSFERENCIA: '03', CREDITO: '04', DEBITO: '28', TARJETA: '28' };

export interface ProductoFiscalDato {
  claveProdServ: string;
  claveUnidad: string;
  unidadNombre?: string | null;
  objetoImp: string;
}

export interface VentaParaFactura {
  id: string;
  folio: string;
  status: string;
  items: SaleItem[];
  subtotal: number | string;
  impuestos: number | string;
  total: number | string;
  formaPago?: string;
  formasPago?: Array<{ forma: string; monto: number | string }> | null;
}

export interface DatosArmado {
  venta: VentaParaFactura;
  emisor: { rfc: string; nombreFiscal: string; regimenFiscal: string };
  codigoPostalExpedicion: string;
  receptor: { rfc: string; nombreFiscal: string; codigoPostal: string; regimenFiscal: string };
  usoCfdi: string;
  productos: Map<string, ProductoFiscalDato>;
  serie?: string | null;
  folio?: number | null;
}

export interface ResultadoArmado {
  entrada?: CfdiEntrada;
  errores: string[];
  advertencias: string[];
  /** total del CFDI − total de la venta (el CFDI manda, D-10). */
  diferenciaCentavos: number;
}

export function armarCfdiDesdeVenta(d: DatosArmado): ResultadoArmado {
  const errores: string[] = [];
  const advertencias: string[] = [];
  const v = d.venta;

  if (v.status !== 'PAGADA') errores.push('La venta no está pagada: solo se facturan ventas cobradas.');

  const rec = validarRfc(d.receptor.rfc);
  if (rec.ok && (rec.tipo === 'GENERICO_NACIONAL' || rec.tipo === 'GENERICO_EXTRANJERO')) {
    errores.push('Para público en general no se factura venta por venta: eso se hace con la factura global (fase posterior).');
  }

  const items = (v.items ?? []).filter((i) => !i.anulado);
  if (!items.length) errores.push('La venta no tiene partidas.');

  // Forma de pago
  const pagos = (v.formasPago && v.formasPago.length ? v.formasPago : [{ forma: v.formaPago ?? 'EFECTIVO', monto: v.total }]).map((p) => ({ forma: p.forma, monto: Number(p.monto) }));
  if (pagos.some((p) => p.forma === 'CORTESIA')) errores.push('Una venta con cortesía no se factura.');
  const mayor = [...pagos].sort((a, b) => b.monto - a.monto)[0];
  const formaPago = mayor ? FORMA_PAGO_SAT[mayor.forma] : undefined;
  if (mayor && !formaPago && !errores.some((e) => e.includes('cortesía'))) errores.push(`La forma de pago «${mayor.forma}» no tiene equivalente SAT.`);
  if (new Set(pagos.map((p) => p.forma)).size > 1) advertencias.push(`Pago mixto: se usó la forma de pago de mayor monto (${mayor.forma}). [VALIDAR con el contador]`);

  // Conceptos
  const faltantes: string[] = [];
  const conceptos: ConceptoEntrada[] = [];
  for (const it of items) {
    const p = d.productos.get(it.productoId);
    if (!p || !p.claveProdServ || !p.claveUnidad || !p.objetoImp) {
      faltantes.push(it.nombre);
      continue;
    }
    const tasa: TasaIva = isValidTasaIva(it.tasaIva) ? it.tasaIva : DEFAULT_TASA_IVA;
    const base = r2(Number(it.subtotal));
    const cantidad = Number(it.cantidad);
    if (!(cantidad > 0)) {
      errores.push(`La partida «${it.nombre}» tiene cantidad inválida.`);
      continue;
    }
    let traslados: ImpuestoConcepto[] | undefined;
    if (p.objetoImp === '01') {
      if (tasa !== '0' && tasa !== 'EXENTO') errores.push(`«${it.nombre}» se vendió con IVA pero su clave SAT dice «no objeto de impuesto».`);
    } else if (tasa === 'EXENTO') {
      traslados = [{ impuesto: '002', tipoFactor: 'Exento', base }];
    } else {
      const t = tasaNumerica(tasa);
      traslados = [{ impuesto: '002', tipoFactor: 'Tasa', tasa: t, base, importe: r2(base * t) }];
    }
    conceptos.push({
      claveProdServ: p.claveProdServ,
      claveUnidad: p.claveUnidad,
      unidad: p.unidadNombre ?? undefined,
      descripcion: it.nombre,
      cantidad,
      // El importe ya es neto de su descuento por partida: el CFDI muestra el precio efectivo. [VALIDAR si el contador prefiere el descuento desglosado]
      valorUnitario: r6(base / cantidad),
      importe: base,
      objetoImp: p.objetoImp,
      traslados,
    });
  }
  if (faltantes.length) errores.push(`Falta la clave SAT (producto/servicio, unidad u objeto de impuesto) de: ${[...new Set(faltantes)].join(', ')}.`);

  const subtotal = r2(conceptos.reduce((s, c) => s + c.importe, 0));
  const impuestos = r2(conceptos.reduce((s, c) => s + (c.traslados ?? []).reduce((a, t) => a + (t.importe ?? 0), 0), 0));
  const total = r2(subtotal + impuestos);

  // La venta debe cuadrar con sus partidas; si no, hay un descuento general u otro ajuste que F1 no reparte.
  if (!faltantes.length && conceptos.length) {
    const sumaVenta = r2(items.reduce((s, i) => s + Number(i.subtotal), 0));
    if (Math.abs(sumaVenta - r2(Number(v.subtotal))) > 0.01) {
      errores.push('La venta tiene un descuento o ajuste general que todavía no se reparte entre las partidas: no se puede facturar automáticamente.');
    }
  }
  const diferenciaCentavos = r2(total - r2(Number(v.total)));
  if (conceptos.length && !faltantes.length && Math.abs(diferenciaCentavos) > TOLERANCIA_REDONDEO) {
    errores.push(`El total del comprobante (${total.toFixed(2)}) no cuadra con el de la venta (${r2(Number(v.total)).toFixed(2)}).`);
  } else if (diferenciaCentavos !== 0 && conceptos.length) {
    advertencias.push(`El IVA por concepto difiere ${diferenciaCentavos.toFixed(2)} del ticket (redondeo): el comprobante manda. [VALIDAR D-10]`);
  }

  if (errores.length) return { errores, advertencias, diferenciaCentavos };

  const entrada: CfdiEntrada = {
    tipo: 'I',
    serie: d.serie ?? undefined,
    folio: d.folio != null ? String(d.folio) : undefined,
    moneda: 'MXN',
    lugarExpedicion: d.codigoPostalExpedicion,
    formaPago,
    metodoPago: 'PUE',
    exportacion: '01',
    emisor: { rfc: d.emisor.rfc, nombreFiscal: d.emisor.nombreFiscal, regimenFiscal: d.emisor.regimenFiscal },
    receptor: { rfc: d.receptor.rfc, nombreFiscal: d.receptor.nombreFiscal, codigoPostal: d.receptor.codigoPostal, regimenFiscal: d.receptor.regimenFiscal, usoCfdi: d.usoCfdi },
    conceptos,
    subtotal,
    total,
  };
  return { entrada, errores: [], advertencias, diferenciaCentavos };
}

// ── nota de crédito (CFDI de egreso) ──
export type ResultadoNotaCredito = { entrada: CfdiEntrada; errores: [] } | { entrada?: undefined; errores: string[] };

/** [VALIDAR] Uso de CFDI y tipo de relación de los egresos por devolución: G02 y 01 (nota de crédito de los documentos relacionados). */
export const USO_CFDI_EGRESO = 'G02';
export const TIPO_RELACION_NOTA_CREDITO = '01';

export function armarNotaCredito(args: {
  original: CfdiEntrada;
  uuidOriginal: string;
  indices: number[]; // conceptos de la factura original que se acreditan (vacío = todos)
  yaAcreditados: number[];
  serie?: string | null;
  folio?: number | null;
}): ResultadoNotaCredito {
  const { original } = args;
  const todos = original.conceptos.map((_, i) => i);
  const indices = args.indices.length ? [...new Set(args.indices)].sort((a, b) => a - b) : todos;
  const errores: string[] = [];
  if (indices.some((i) => !Number.isInteger(i) || i < 0 || i >= original.conceptos.length)) errores.push('Alguna partida a acreditar no existe en la factura.');
  const repetidos = indices.filter((i) => args.yaAcreditados.includes(i));
  if (repetidos.length) errores.push('Esas partidas ya tienen nota de crédito.');
  if (errores.length) return { errores };

  const conceptos = indices.map((i) => original.conceptos[i]);
  const subtotal = r2(conceptos.reduce((s, c) => s + c.importe, 0));
  const impuestos = r2(conceptos.reduce((s, c) => s + (c.traslados ?? []).reduce((a, t) => a + (t.importe ?? 0), 0), 0));
  return {
    errores: [],
    entrada: {
      ...original,
      tipo: 'E',
      serie: args.serie ?? undefined,
      folio: args.folio != null ? String(args.folio) : undefined,
      metodoPago: 'PUE',
      receptor: { ...original.receptor, usoCfdi: USO_CFDI_EGRESO },
      conceptos,
      subtotal,
      descuento: undefined,
      total: r2(subtotal + impuestos),
      uuidRelacionados: { tipoRelacion: TIPO_RELACION_NOTA_CREDITO, uuids: [args.uuidOriginal] },
    },
  };
}

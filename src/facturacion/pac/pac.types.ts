// Modelo propio del comprobante, independiente del formato de cada PAC (DISENO-CFDI-40.md §2.1). El adaptador lo traduce.

export type TipoComprobante = 'I' | 'E' | 'P' | 'T';

export interface EmisorEntrada {
  rfc: string;
  nombreFiscal: string;
  regimenFiscal: string;
}

export interface ReceptorEntrada {
  rfc: string;
  nombreFiscal: string;
  codigoPostal: string;
  regimenFiscal: string;
  usoCfdi: string;
}

export interface ImpuestoConcepto {
  impuesto: '002'; // IVA
  tipoFactor: 'Tasa' | 'Exento';
  tasa?: number; // 0.16, 0.08, 0
  base: number;
  importe?: number;
}

export interface ConceptoEntrada {
  claveProdServ: string;
  claveUnidad: string;
  unidad?: string;
  descripcion: string;
  cantidad: number;
  valorUnitario: number;
  descuento?: number;
  importe: number;
  objetoImp: string;
  traslados?: ImpuestoConcepto[];
}

export interface CfdiEntrada {
  tipo: TipoComprobante;
  serie?: string;
  folio?: string;
  moneda: string;
  lugarExpedicion: string;
  formaPago?: string;
  metodoPago?: 'PUE' | 'PPD';
  exportacion: '01';
  emisor: EmisorEntrada;
  receptor: ReceptorEntrada;
  conceptos: ConceptoEntrada[];
  subtotal: number;
  descuento?: number;
  total: number;
  uuidRelacionados?: { tipoRelacion: string; uuids: string[] };
}

export type CodigoErrorFiscal =
  | 'RFC_EMISOR_INVALIDO'
  | 'RFC_RECEPTOR_INVALIDO'
  | 'CP_INVALIDO'
  | 'SIN_CONCEPTOS'
  | 'TOTAL_NO_CUADRA'
  | 'CSD_VENCIDO'
  | 'SERVICIO_NO_DISPONIBLE'
  | 'UUID_NO_ENCONTRADO'
  | 'YA_CANCELADO'
  | 'MOTIVO_INVALIDO';

export interface ErrorFiscal {
  codigo: CodigoErrorFiscal;
  mensaje: string; // en español, apto para el usuario; el error crudo del proveedor nunca sale de su adaptador
}

export interface ResultadoValidacion {
  ok: boolean;
  errores: ErrorFiscal[];
}

export interface CfdiTimbrado {
  uuid: string;
  fechaTimbrado: Date;
  referencia: string; // la claveIdempotencia con la que se pidió
  xml: string;
  selloSat: string;
  certificadoSat: string;
  /** El Mock marca TRUE: este comprobante NO tiene validez fiscal. */
  sinValidezFiscal: boolean;
}

export type EstatusSat = 'Vigente' | 'Cancelado' | 'EnProceso' | 'NoEncontrado';

export interface ResultadoCancelacion {
  estatus: EstatusSat;
  requiereAceptacion: boolean;
}

export interface PacCapacidades {
  cancelacionConAceptacion: boolean;
  consultaEstatusSat: boolean;
  complementoPago: boolean;
  globalPublico: boolean;
}

/** Error de negocio del puerto: ya traducido; los adaptadores reales lo lanzan en lugar de propagar el error del proveedor. */
export class PacError extends Error {
  constructor(
    public readonly codigo: CodigoErrorFiscal,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'PacError';
  }
}

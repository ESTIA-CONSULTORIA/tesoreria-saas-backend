import type {
  CfdiEntrada,
  CfdiTimbrado,
  EmisorEntrada,
  EstatusSat,
  PacCapacidades,
  ResultadoCancelacion,
  ResultadoValidacion,
} from './pac.types';

// Puerto del proveedor de timbrado (DISENO-CFDI-40.md §2.1). Solo el adaptador conoce URLs, autenticación y formatos del PAC;
// ninguna pantalla ni caso de uso nombra al proveedor. Los errores del proveedor se traducen a PacError.
export interface PacProvider {
  readonly nombre: string;
  readonly capacidades: PacCapacidades;

  /** Valida sin timbrar (estructura, RFC, CP...). */
  validar(entrada: CfdiEntrada): Promise<ResultadoValidacion>;

  /** Timbra. `claveIdempotencia` es obligatoria: el mismo valor nunca produce dos timbrados. */
  timbrar(entrada: CfdiEntrada, claveIdempotencia: string): Promise<CfdiTimbrado>;

  /** Recupera un CFDI ya timbrado por su referencia (reintento tras timeout: nunca re-timbrar a ciegas). */
  consultarPorReferencia(emisorRfc: string, referencia: string): Promise<CfdiTimbrado | null>;

  cancelar(uuid: string, motivo: '01' | '02' | '03' | '04', uuidSustituto?: string): Promise<ResultadoCancelacion>;
  estatus(uuid: string): Promise<EstatusSat>;
  descargarXml(uuid: string): Promise<Buffer>;
  descargarPdf?(uuid: string): Promise<Buffer>;

  registrarEmisor?(emisor: EmisorEntrada): Promise<void>;
  saldoTimbres?(emisorRfc: string): Promise<number>;
}

// Token de inyección de Nest (las interfaces no existen en tiempo de ejecución).
export const PAC_PROVIDER = Symbol('PAC_PROVIDER');

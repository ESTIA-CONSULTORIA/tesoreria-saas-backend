import { createHash } from 'crypto';
import { esCodigoPostal, validarRfc } from '../fiscal-validators';
import type { PacProvider } from './pac-provider';
import {
  PacError,
  type CfdiEntrada,
  type CfdiTimbrado,
  type ErrorFiscal,
  type EstatusSat,
  type PacCapacidades,
  type ResultadoCancelacion,
  type ResultadoValidacion,
} from './pac.types';

export interface MockPacOpciones {
  /** Fuerza que `timbrar` falle con SERVICIO_NO_DISPONIBLE (para probar INCIERTO y reintento). */
  fallarTimbrado?: boolean;
  /** Fecha fija para resultados reproducibles. */
  ahora?: () => Date;
}

// Adaptador de pruebas y demos. DETERMINISTA: la misma `claveIdempotencia` da siempre el mismo UUID. NO timbra nada real:
// todo comprobante sale marcado `sinValidezFiscal` y con el XML rotulado como simulado. Estado en memoria del proceso.
export class MockPacProvider implements PacProvider {
  readonly nombre = 'mock';
  readonly capacidades: PacCapacidades = {
    cancelacionConAceptacion: true,
    consultaEstatusSat: true,
    complementoPago: true,
    globalPublico: true,
  };

  private porReferencia = new Map<string, CfdiTimbrado>();
  private porUuid = new Map<string, { cfdi: CfdiTimbrado; estatus: EstatusSat }>();

  constructor(private opciones: MockPacOpciones = {}) {}

  private ahora(): Date {
    return this.opciones.ahora ? this.opciones.ahora() : new Date();
  }

  async validar(e: CfdiEntrada): Promise<ResultadoValidacion> {
    const errores: ErrorFiscal[] = [];
    if (!validarRfc(e.emisor?.rfc).ok) errores.push({ codigo: 'RFC_EMISOR_INVALIDO', mensaje: 'El RFC del emisor no es válido.' });
    if (!validarRfc(e.receptor?.rfc).ok) errores.push({ codigo: 'RFC_RECEPTOR_INVALIDO', mensaje: 'El RFC del receptor no es válido.' });
    if (!esCodigoPostal(e.lugarExpedicion) || !esCodigoPostal(e.receptor?.codigoPostal)) {
      errores.push({ codigo: 'CP_INVALIDO', mensaje: 'El código postal de expedición o del receptor no es válido.' });
    }
    if (!e.conceptos?.length) {
      errores.push({ codigo: 'SIN_CONCEPTOS', mensaje: 'El comprobante no tiene conceptos.' });
    } else {
      const sumaImportes = redondear(e.conceptos.reduce((s, c) => s + c.importe, 0));
      if (Math.abs(sumaImportes - e.subtotal) > 0.01) {
        errores.push({ codigo: 'TOTAL_NO_CUADRA', mensaje: 'La suma de los conceptos no coincide con el subtotal.' });
      }
    }
    return { ok: errores.length === 0, errores };
  }

  async timbrar(entrada: CfdiEntrada, claveIdempotencia: string): Promise<CfdiTimbrado> {
    if (!claveIdempotencia) throw new Error('claveIdempotencia es obligatoria');
    const previo = this.porReferencia.get(claveIdempotencia);
    if (previo) return previo; // idempotente: nunca dos timbrados con la misma clave
    if (this.opciones.fallarTimbrado) {
      throw new PacError('SERVICIO_NO_DISPONIBLE', 'El servicio de facturación no está disponible. Intenta de nuevo en unos minutos.');
    }
    const v = await this.validar(entrada);
    if (!v.ok) throw new PacError(v.errores[0].codigo, v.errores[0].mensaje);

    const uuid = uuidDeterminista(claveIdempotencia);
    const cfdi: CfdiTimbrado = {
      uuid,
      fechaTimbrado: this.ahora(),
      referencia: claveIdempotencia,
      xml: `<!-- SIMULADO: sin validez fiscal --><cfdi:Comprobante Total="${entrada.total.toFixed(2)}" Emisor="${entrada.emisor.rfc}" Receptor="${entrada.receptor.rfc}" UUID="${uuid}"/>`,
      selloSat: Buffer.from(`MOCK-${uuid}`).toString('base64'),
      certificadoSat: '00000000000000000000',
      sinValidezFiscal: true,
    };
    this.porReferencia.set(claveIdempotencia, cfdi);
    this.porUuid.set(uuid, { cfdi, estatus: 'Vigente' });
    return cfdi;
  }

  async consultarPorReferencia(_emisorRfc: string, referencia: string): Promise<CfdiTimbrado | null> {
    return this.porReferencia.get(referencia) ?? null;
  }

  async cancelar(uuid: string, motivo: '01' | '02' | '03' | '04', uuidSustituto?: string): Promise<ResultadoCancelacion> {
    if (!['01', '02', '03', '04'].includes(motivo)) throw new PacError('MOTIVO_INVALIDO', 'Motivo de cancelación inválido.');
    const reg = this.porUuid.get(uuid);
    if (!reg) throw new PacError('UUID_NO_ENCONTRADO', 'No se encontró el comprobante.');
    if (reg.estatus === 'Cancelado') throw new PacError('YA_CANCELADO', 'El comprobante ya está cancelado.');
    if (motivo === '01' && !uuidSustituto) {
      throw new PacError('MOTIVO_INVALIDO', 'El motivo 01 requiere el UUID del comprobante que lo sustituye.');
    }
    // Mock: 02 y 03 se cancelan al instante; 01 y 04 quedan en proceso, a la espera de que el receptor acepte.
    const requiereAceptacion = motivo === '01' || motivo === '04';
    reg.estatus = requiereAceptacion ? 'EnProceso' : 'Cancelado';
    return { estatus: reg.estatus, requiereAceptacion };
  }

  async estatus(uuid: string): Promise<EstatusSat> {
    return this.porUuid.get(uuid)?.estatus ?? 'NoEncontrado';
  }

  async descargarXml(uuid: string): Promise<Buffer> {
    const reg = this.porUuid.get(uuid);
    if (!reg) throw new PacError('UUID_NO_ENCONTRADO', 'No se encontró el comprobante.');
    return Buffer.from(reg.cfdi.xml, 'utf8');
  }

  async saldoTimbres(): Promise<number> {
    return 999999;
  }
}

const redondear = (n: number) => Math.round(n * 100) / 100;

// UUID con forma de v4 derivado de SHA-256(clave): reproducible y claramente no emitido por el SAT.
function uuidDeterminista(clave: string): string {
  const h = createHash('sha256').update(`mock-pac:${clave}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

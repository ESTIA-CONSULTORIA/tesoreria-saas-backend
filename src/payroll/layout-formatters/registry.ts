import { BadRequestException } from '@nestjs/common';
import { PayrollLayoutFormatter } from './payroll-layout-formatter.interface';
import { GenericCsvFormatter } from './generic-csv.formatter';

// Auditoría de producto (GoodsHabits, Fase 3 — Nómina): catálogo de bancos para el modo
// "archivo de layout bancario". Investigué BBVA, Santander, Banorte y HSBC (WebSearch +
// WebFetch contra las páginas técnicas que existen públicamente) buscando la especificación
// exacta de campos/posiciones de cada layout de dispersión de nómina, siguiendo la misma
// regla que ya se acordó: no fabricar ningún layout de memoria.
//
// Resultado: ningún banco tiene una especificación técnica completa y verificable
// públicamente. Lo más cercano fue un fragmento de Banorte (layouts de 108 y 232
// posiciones, registro de encabezado tipo 'H'/NE, fecha AAAAMMDD) proveniente de un
// resumen de búsqueda de un documento de terceros (Scribd/pdfcookie) — no la tabla de
// posiciones de campo en sí, que quedó bloqueada tras un muro de pago/403. No es suficiente
// para implementar un formatter real sin arriesgar un archivo mal armado.
//
// Los 4 quedan REGISTRADOS aquí (seleccionables por un tenant a futuro) pero SIN formatter
// real — pedir su layout lanza un error explícito en vez de generar un archivo adivinado.
// Agregar cada uno es escribir su clase (mismo patrón que GenericCsvFormatter) en cuanto
// Miguel consiga la especificación real — contacto directo con el banco, o documentación
// que el cliente que lo use pueda proporcionar de su propio contrato de banca empresarial.
export const REGISTERED_BANKS: Array<{ code: string; name: string; hasFormatter: boolean }> = [
  { code: 'GENERIC', name: 'Genérico (CSV — CLABE, nombre, monto, referencia, RFC)', hasFormatter: true },
  { code: 'BBVA', name: 'BBVA', hasFormatter: false },
  { code: 'SANTANDER', name: 'Santander', hasFormatter: false },
  { code: 'BANORTE', name: 'Banorte', hasFormatter: false },
  { code: 'HSBC', name: 'HSBC', hasFormatter: false },
];

const FORMATTERS: Record<string, PayrollLayoutFormatter> = {
  GENERIC: new GenericCsvFormatter(),
};

export function getLayoutFormatter(bankCode: string): PayrollLayoutFormatter {
  const formatter = FORMATTERS[bankCode];
  if (!formatter) {
    const known = REGISTERED_BANKS.find((b) => b.code === bankCode);
    if (known) {
      throw new BadRequestException(
        `El layout de ${known.name} todavía no está implementado — no se encontró una especificación pública y verificable de su formato. Usa el formato Genérico (CSV) o proporciona la especificación oficial del banco.`,
      );
    }
    throw new BadRequestException(`Banco "${bankCode}" no reconocido.`);
  }
  return formatter;
}

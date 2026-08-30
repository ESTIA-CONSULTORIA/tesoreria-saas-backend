import { DispersionEntry, PayrollLayoutFormatter } from './payroll-layout-formatter.interface';

// Auditoría de producto (GoodsHabits, Fase 3 — Nómina): única implementación real de
// PayrollLayoutFormatter en esta fase. CLABE, nombre, monto, referencia y RFC son el mínimo
// común que la mayoría de portales de banca empresarial en México acepta como carga
// simple/CSV, además de su layout propietario — no se investigó ni se fabricó ningún layout
// de ancho fijo específico de banco (ver registry.ts para el porqué y qué falta).
export class GenericCsvFormatter implements PayrollLayoutFormatter {
  readonly bankCode = 'GENERIC';

  format(entries: DispersionEntry[]): { fileName: string; content: string; mimeType: string } {
    const header = 'clabe,nombre,monto,referencia,rfc';
    const rows = entries.map((e) => {
      const nombre = `"${e.employeeName.replace(/"/g, '""')}"`;
      const monto = e.amount.toFixed(2);
      const referencia = `"${e.reference.replace(/"/g, '""')}"`;
      return [e.clabe, nombre, monto, referencia, e.rfc || ''].join(',');
    });
    const content = [header, ...rows].join('\r\n');

    return {
      fileName: `dispersion_generic_${Date.now()}.csv`,
      content,
      mimeType: 'text/csv',
    };
  }
}

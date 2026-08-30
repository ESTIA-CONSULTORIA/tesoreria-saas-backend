// Auditoría de producto (GoodsHabits, Fase 3 — Nómina): interfaz para el modo "archivo de
// layout bancario" de dispersión — mismo espíritu que StorageProvider. Agregar el layout
// exacto de un banco nuevo es escribir una clase que implemente esto, sin tocar
// payroll.service.ts ni el endpoint que la expone.
export interface DispersionEntry {
  employeeName: string;
  clabe: string;
  banco?: string;
  amount: number;
  reference: string; // folio de la corrida + identificador del empleado, para conciliar
  rfc?: string;
}

export interface PayrollLayoutFormatter {
  readonly bankCode: string;
  format(entries: DispersionEntry[]): { fileName: string; content: string; mimeType: string };
}

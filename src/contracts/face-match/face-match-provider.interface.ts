// Auditoría de producto (GoodsHabits, Fase 3 — Firma electrónica): punto de extensión para
// validación facial (selfie vs. INE). Ningún proveedor real conectado en esta fase —
// decisión explícita: solo NullFaceMatchProvider. Cuando se contrate AWS Rekognition o
// Azure Face API, se agrega una clase que implemente esto (RekognitionFaceMatchProvider /
// AzureFaceMatchProvider) y se registra en ContractsModule — signContract() no cambia.
export interface FaceMatchResult {
  score: number | null;
  isMatch: boolean | null;
  skipped: boolean;
}

export interface FaceMatchProvider {
  compare(selfie: Buffer, ineFront: Buffer): Promise<FaceMatchResult>;
}

export const FACE_MATCH_PROVIDER = 'FACE_MATCH_PROVIDER';

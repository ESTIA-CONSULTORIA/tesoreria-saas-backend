import { MigrationInterface, QueryRunner } from "typeorm";

// Auditoría de producto (GoodsHabits, Fase 3 — Firma electrónica, Falta 6): limpia las
// filas stored_file cuyo providerRef trae el data-URL completo del frontend
// (canvas.toDataURL('image/png') sin limpiar) en vez de base64 puro. Confirmado contra
// producción: exactamente 3 filas, todas role='signature' — cero filas selfie/ine_front/
// ine_back existen todavía (nadie las ha usado). Preexistente a esta fase: signContract()
// (antes del refactor de Storage) guardaba el valor del formulario sin limpiar, aunque
// generateSignedPdf() sí lo limpiaba para su propio uso en memoria — la migración de
// Storage copió ese valor tal cual, sin corromper nada adicional.
export class CleanDataUrlPrefixInStoredFile1788300000000 implements MigrationInterface {
    name = 'CleanDataUrlPrefixInStoredFile1788300000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE "stored_file"
            SET "providerRef" = regexp_replace("providerRef", '^data:[^;]+;base64,', '')
            WHERE "ownerType" = 'contract'
              AND role = 'signature'
              AND provider = 'base64_postgres'
              AND "providerRef" LIKE 'data:%'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // No reversible con precisión: no hay forma de distinguir, después del up(), cuáles
        // filas tenían el prefijo originalmente de las que ya eran base64 puro desde su
        // creación (ej. firmas capturadas después de este mismo despliegue). Re-anteponer
        // el prefijo a ciegas corrompería filas nuevas legítimas. Es una limpieza de datos,
        // no un cambio de esquema — mismo criterio que el resto de las migraciones de este
        // proyecto: down() revierte estructura, no siempre datos.
    }

}

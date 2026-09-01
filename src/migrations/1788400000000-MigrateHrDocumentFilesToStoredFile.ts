import { MigrationInterface, QueryRunner } from "typeorm";

// Auditoría de producto (GoodsHabits, Fase 3 — Storage, Frente 2): migra hr_document a
// StoredFile, mismo protocolo que MigrateContractFilesToStoredFile1788200000000 (stored_file
// ya existe desde esa migración — esta NO la vuelve a crear). Precedida por una auditoría de
// solo lectura (hr-document-migration-audit.sql) corrida contra producción el 2026-08-31:
// 26 filas, 0 huérfanas, 0 tenantId nulo, 0 con ambos (fileData+url) a la vez — dataset chico
// y limpio, seguro de migrar con lógica en JS en vez de SQL puro.
//
// A diferencia de Contract (7 columnas → 7 roles), HrDocument es 1:1 con su archivo — todas
// las filas usan role='file' constante. "tipo" (INE/CURP/RECIBO_NOMINA/...) sigue viviendo en
// hr_document y sigue siendo la forma de saber QUÉ es el documento; role='file' solo dice
// "aquí está su archivo".
//
// hr_document no tiene tenantId propio — se resuelve por JOIN a employee.tenantId (igual que
// hizo la sección 3 del audit script). employee.id es uuid, hr_document.employeeId es varchar
// — mismo cast ::text ya visto en AddGiroToTenant / MigrateContractFiles...
//
// Reconstrucción de providerRef para las filas con "url" (Cloudinary): igual que
// hr.service.ts::removeDocument() hace HOY al borrar (parsea el public_id desde la URL de
// entrega, no depende de haber guardado el public_id aparte) — se replica esa misma lógica
// aquí en vez de asumir un patrón determinístico como pudo hacerse con Contract
// (signed_${contractId}), porque el código viejo de HrDocument generaba el public_id con
// Date.now() (no reconstruible).
//
// Caso especial confirmado en el audit (2026-08-31): 24 de las 26 filas son datos de seed
// (seed.ts, docTemplates) con URL placeholder "https://example.com/doc-*.pdf" — nunca
// pasaron por CloudinaryProvider, no hay archivo real detrás. Se guardan con
// provider='base64_postgres' (delete() de ese provider es no-op) y providerRef='' — MISMO
// comportamiento que hoy: removeDocument() ya evita llamar a Cloudinary para estas filas
// porque su URL no contiene "/upload/", así que marcarlas como 'cloudinary' con un
// providerRef inventado sería un cambio de comportamiento real (arriesgaría una llamada a la
// API de Cloudinary con un public_id vacío/inválido al borrarlas). getContent() de
// StorageService igual devuelve el mismo string inútil de siempre porque prioriza file.url
// sobre providerRef.
export class MigrateHrDocumentFilesToStoredFile1788400000000 implements MigrationInterface {
    name = 'MigrateHrDocumentFilesToStoredFile1788400000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        const rows: Array<{
            id: string;
            tenantId: string | null;
            fileData: string | null;
            url: string | null;
        }> = await queryRunner.query(`
            SELECT hd.id, e."tenantId", hd."fileData", hd.url
            FROM hr_document hd
            JOIN employee e ON e.id::text = hd."employeeId"
            WHERE (hd."fileData" IS NOT NULL AND hd."fileData" <> '')
               OR (hd.url IS NOT NULL AND hd.url <> '')
        `);

        for (const row of rows) {
            if (!row.tenantId) {
                // Cubierto por el audit (0 filas hoy) pero defensivo: no migrar a ciegas una
                // fila sin tenant real, mismo criterio que la sección 3 del audit script.
                continue;
            }

            if (row.fileData) {
                const { base64, mimeType } = this.parseDataUrlOrRaw(row.fileData);
                const sizeBytes = Buffer.byteLength(base64, 'base64');
                await queryRunner.query(
                    `INSERT INTO "stored_file" ("tenantId","ownerType","ownerId","role","provider","providerRef","mimeType","sizeBytes")
                     VALUES ($1,'hr_document',$2,'file','base64_postgres',$3,$4,$5)`,
                    [row.tenantId, row.id, base64, mimeType, sizeBytes],
                );
                continue;
            }

            // row.url: distingue URL real de Cloudinary (reconstruye providerRef) de
            // placeholder de seed (providerRef vacío, ver nota arriba).
            const cloudinaryRef = this.extractCloudinaryPublicId(row.url!);
            if (cloudinaryRef) {
                await queryRunner.query(
                    `INSERT INTO "stored_file" ("tenantId","ownerType","ownerId","role","provider","providerRef","url","mimeType")
                     VALUES ($1,'hr_document',$2,'file','cloudinary',$3,$4,$5)`,
                    [row.tenantId, row.id, cloudinaryRef, row.url, this.mimeTypeFromUrl(row.url!)],
                );
            } else {
                await queryRunner.query(
                    `INSERT INTO "stored_file" ("tenantId","ownerType","ownerId","role","provider","providerRef","url","mimeType")
                     VALUES ($1,'hr_document',$2,'file','base64_postgres','',$3,$4)`,
                    [row.tenantId, row.id, row.url, this.mimeTypeFromUrl(row.url!)],
                );
            }
        }

        await queryRunner.query(`ALTER TABLE "hr_document" DROP COLUMN "fileData"`);
        await queryRunner.query(`ALTER TABLE "hr_document" DROP COLUMN "url"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "hr_document" ADD "fileData" text`);
        await queryRunner.query(`ALTER TABLE "hr_document" ADD "url" character varying`);

        // Re-antepone "data:mime;base64," al restaurar — el up() lo despoja al migrar (ver
        // parseDataUrlOrRaw), pero el código previo a esta migración (hr.service.ts / el
        // frontend, <img src={doc.fileData}>) necesita el data-URI completo para renderizar,
        // no base64 puro. Sin esto, un down() de emergencia dejaría fileData técnicamente
        // poblado pero inservible para ese código viejo.
        await queryRunner.query(`
            UPDATE "hr_document" hd SET "fileData" = CASE
                WHEN sf."mimeType" IS NOT NULL THEN 'data:' || sf."mimeType" || ';base64,' || sf."providerRef"
                ELSE sf."providerRef"
            END
            FROM "stored_file" sf
            WHERE sf."ownerType" = 'hr_document' AND sf."ownerId" = hd."id"::text
              AND sf.role = 'file' AND sf.provider = 'base64_postgres' AND sf."providerRef" <> ''
        `);
        await queryRunner.query(`
            UPDATE "hr_document" hd SET "url" = sf."url"
            FROM "stored_file" sf
            WHERE sf."ownerType" = 'hr_document' AND sf."ownerId" = hd."id"::text
              AND sf.role = 'file' AND sf.url IS NOT NULL
        `);

        // No borra las filas de stored_file migradas — misma política que
        // MigrateContractFilesToStoredFile1788200000000 (down() revierte esquema, no datos;
        // la tabla stored_file es compartida con 'contract' y quedaría rota si se limpiara
        // aquí sin criterio para distinguir dueño).
        //
        // Límite conocido (probado con datos sintéticos): una fila que up() haya saltado por
        // huérfana o sin tenant (0 filas hoy según el audit) nunca llegó a stored_file, así
        // que este down() no tiene de dónde restaurarle fileData/url — quedaría NULL pese a
        // haber tenido archivo antes del up(). Aceptable porque hoy no aplica a ninguna fila
        // real; si algún día aplica, es una pérdida de datos real y debe tratarse aparte
        // antes de revertir (no confiar en este down() a ciegas para ese caso).
    }

    // Acepta "data:mime;base64,xxx" (lo que guardaba addDocument/ocrDocument sin Cloudinary)
    // o base64 puro — mismo criterio que Base64PostgresProvider.toBase64() /
    // CleanDataUrlPrefixInStoredFile, así stored_file.providerRef nunca vuelve a necesitar
    // esa limpieza para estas filas.
    private parseDataUrlOrRaw(value: string): { base64: string; mimeType: string | null } {
        const match = value.match(/^data:([^;]+);base64,(.+)$/s);
        if (match) return { base64: match[2], mimeType: match[1] };
        return { base64: value, mimeType: null };
    }

    // Replica EXACTO el parseo que hr.service.ts::removeDocument() ya usa hoy para borrar en
    // Cloudinary: busca "/upload/" en la URL de entrega y toma todo lo que sigue después del
    // segmento de versión, sin extensión. Devuelve null si la URL no tiene esa forma (caso de
    // las 24 filas de seed con "https://example.com/doc-*.pdf").
    private extractCloudinaryPublicId(url: string): string | null {
        const urlParts = url.split('/');
        const uploadIndex = urlParts.indexOf('upload');
        if (uploadIndex === -1) return null;
        const publicIdWithExt = urlParts.slice(uploadIndex + 2).join('/');
        if (!publicIdWithExt) return null;
        return publicIdWithExt.replace(/\.[^/.]+$/, '');
    }

    private mimeTypeFromUrl(url: string): string | null {
        const ext = url.split('.').pop()?.toLowerCase().split(/[?#]/)[0];
        const map: Record<string, string> = {
            pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg',
            png: 'image/png', webp: 'image/webp', gif: 'image/gif',
        };
        return (ext && map[ext]) || null;
    }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OcrDocument } from './entities/ocr-document.entity';

@Injectable()
export class OcrService {
  constructor(
    @InjectRepository(OcrDocument)
    private readonly repo: Repository<OcrDocument>,
  ) {}

  async processDocument(
    file: Express.Multer.File,
    tenantId?: string,
    companyId?: string,
  ): Promise<OcrDocument> {
    let rawText = '';

    try {
      const isPdf = file.mimetype === 'application/pdf';
      rawText = isPdf
        ? await this.extractPdfText(file.buffer)
        : await this.extractImageText(file.buffer);
    } catch (err) {
      rawText = `[OCR no disponible: ${err?.message || 'error desconocido'}]`;
    }

    // DEBUG: log texto extraído y datos parseados
    console.log('[OCR] Archivo:', file.originalname, '| MIME:', file.mimetype);
    console.log('[OCR] Texto extraído (primeros 600 chars):\n', rawText.slice(0, 600));

    const extractedData = this.parseText(rawText);
    console.log('[OCR] extractedData parseado:', extractedData);

    const documentType = this.detectDocumentType(rawText);

    const doc = this.repo.create({
      tenantId,
      companyId,
      status: 'PENDING',
      rawText,
      extractedData,
      documentType,
      fileName: file.originalname,
    });

    return this.repo.save(doc);
  }

  private async extractImageText(buffer: Buffer): Promise<string> {
    const Tesseract = await import('tesseract.js');
    const createWorker = (Tesseract as any).createWorker ?? Tesseract.default?.createWorker;
    // spa+eng mejora reconocimiento de documentos en español
    const worker = await createWorker('spa+eng');
    const { data } = await worker.recognize(buffer);
    await worker.terminate();
    return data.text || '';
  }

  private async extractPdfText(buffer: Buffer): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require('pdf-parse');
    const result = await pdfParse(buffer);
    return result.text || '';
  }

  private parseText(text: string): Record<string, string> {
    if (!text || text.startsWith('[OCR')) {
      return { documentNumber: '', date: '', provider: '', totalAmount: '', concept: '' };
    }

    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    // Número de documento / folio CFDI
    const docNumberMatch =
      text.match(/(?:folio\s*fiscal|uuid)\s*[:\-]?\s*([A-F0-9\-]{30,40})/i) ||
      text.match(/(?:factura|invoice|n[uú]mero|n[oú]\.?|folio|#)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/\.]{2,25})/i) ||
      text.match(/\b(FAC|REC|DOC|INV|FE|FV|FC)[-\s]?[0-9]{3,10}\b/i);

    // Fecha — formatos DD/MM/YYYY, YYYY-MM-DD, DD de mes de YYYY
    const dateMatch =
      text.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/) ||
      text.match(/(\d{4}[\/\-\.]\d{2}[\/\-\.]\d{2})/) ||
      text.match(/(\d{1,2}\s+de\s+\w+\s+de\s+\d{4})/i) ||
      text.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2})/);

    // Monto total — "Total", "Importe total", "Monto", "Amount" seguido de número
    const totalMatch =
      text.match(/total\s+a?\s*pagar\s*[:\$]?\s*([\d,]+\.?\d{0,2})/i) ||
      text.match(/(?:total|importe\s*total|monto\s*total|grand\s*total)\s*[:\$]?\s*([\d,]+\.?\d{0,2})/i) ||
      text.match(/(?:importe|amount|subtotal)\s*[:\$]?\s*([\d,]+\.?\d{0,2})/i) ||
      text.match(/\$\s*([\d,]{1,3}(?:,\d{3})*(?:\.\d{2})?)\b/);

    // Emisor / proveedor
    const providerMatch =
      text.match(/(?:nombre\s*o\s*raz[oó]n\s*social|raz[oó]n\s*social|nombre\s*del\s*emisor|emisor|proveedor)\s*[:\-]?\s*([^\n]{3,80})/i) ||
      text.match(/(?:nombre|empresa)\s*[:\-]\s*([^\n]{3,80})/i);

    // Concepto / descripción
    const conceptMatch =
      text.match(/(?:concepto|descripci[oó]n\s*del\s*servicio|descripci[oó]n|por|uso\s*de\s*cfdi)\s*[:\-]?\s*([^\n]{3,120})/i);

    const providerFallback = (providerMatch?.[1]?.trim() ?? lines[0] ?? '').slice(0, 100);

    return {
      documentNumber: docNumberMatch?.[1]?.trim() ?? '',
      date: dateMatch?.[1]?.trim() ?? '',
      provider: providerFallback,
      totalAmount: (totalMatch?.[1] ?? '').replace(/,/g, ''),
      concept: (conceptMatch?.[1]?.trim() ?? lines.slice(0, 3).join(' ')).slice(0, 150),
    };
  }

  private detectDocumentType(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes('factura') || lower.includes('invoice')) return 'FACTURA';
    if (lower.includes('recibo') || lower.includes('receipt')) return 'RECIBO';
    if (lower.includes('contrato') || lower.includes('contract')) return 'CONTRATO';
    return 'OTRO';
  }

  async findOne(id: string): Promise<OcrDocument | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findAll(tenantId?: string, companyId?: string): Promise<OcrDocument[]> {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    if (companyId) where.companyId = companyId;
    return this.repo.find({ where, order: { uploadedAt: 'DESC' } });
  }

  async validate(
    id: string,
    validatedData: Record<string, any>,
    validatedBy?: string,
  ): Promise<OcrDocument> {
    await this.repo.update(id, {
      status: 'VALIDATED',
      validatedData,
      validatedAt: new Date(),
      validatedBy,
    });
    return this.repo.findOne({ where: { id } }) as Promise<OcrDocument>;
  }

  async reject(id: string, validatedBy?: string): Promise<OcrDocument> {
    await this.repo.update(id, {
      status: 'REJECTED',
      validatedAt: new Date(),
      validatedBy,
    });
    return this.repo.findOne({ where: { id } }) as Promise<OcrDocument>;
  }

  async remove(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}

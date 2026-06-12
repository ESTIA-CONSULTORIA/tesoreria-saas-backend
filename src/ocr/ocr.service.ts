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

    const extractedData = this.parseText(rawText);
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
    const worker = await createWorker('eng');
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
      return {
        documentNumber: '',
        date: '',
        provider: '',
        totalAmount: '',
        concept: '',
      };
    }

    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    const docNumberMatch =
      text.match(/(?:factura|invoice|n[uú]mero|no\.?|folio|#)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]{2,20})/i) ||
      text.match(/\b(FAC|REC|DOC|INV)[-\s]?[0-9]{3,10}\b/i);

    const dateMatch = text.match(
      /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/,
    );

    const totalMatch =
      text.match(/total\s*:?\s*\$?\s*([\d,]+\.?\d{0,2})/i) ||
      text.match(/importe\s*:?\s*\$?\s*([\d,]+\.?\d{0,2})/i) ||
      text.match(/\$\s*([\d,]{3,}\.?\d{0,2})/);

    const providerMatch =
      text.match(/(?:emisor|proveedor|nombre|raz[oó]n social|empresa)\s*[:\-]?\s*([^\n]{3,80})/i);

    const conceptMatch =
      text.match(/(?:concepto|descripci[oó]n|por)\s*[:\-]?\s*([^\n]{3,100})/i);

    return {
      documentNumber: docNumberMatch?.[1]?.trim() ?? '',
      date: dateMatch?.[1]?.trim() ?? '',
      provider: (providerMatch?.[1]?.trim() ?? lines[0] ?? '').slice(0, 100),
      totalAmount: (totalMatch?.[1] ?? '').replace(/,/g, ''),
      concept: (conceptMatch?.[1]?.trim() ?? lines.slice(0, 2).join(' ')).slice(0, 150),
    };
  }

  private detectDocumentType(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes('factura') || lower.includes('invoice')) return 'FACTURA';
    if (lower.includes('recibo') || lower.includes('receipt')) return 'RECIBO';
    if (lower.includes('contrato') || lower.includes('contract')) return 'CONTRATO';
    return 'OTRO';
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

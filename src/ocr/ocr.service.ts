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
    // spa+eng mejora reconocimiento de documentos en español
    const worker = await createWorker('spa+eng');
    const { data } = await worker.recognize(buffer);
    await worker.terminate();
    return data.text || '';
  }

  private async extractPdfText(buffer: Buffer): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParseModule = require('pdf-parse');
    const pdfParse = typeof pdfParseModule === 'function' ? pdfParseModule : pdfParseModule.default;
    const result = await pdfParse(buffer);
    return result.text || '';
  }

  private parseText(text: string): Record<string, string> {
    if (!text || text.startsWith('[OCR')) {
      return { numeroDocumento: '', fecha: '', proveedor: '', montoTotal: '', concepto: '' };
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
      numeroDocumento: docNumberMatch?.[1]?.trim() ?? '',
      fecha: dateMatch?.[1]?.trim() ?? '',
      proveedor: providerFallback,
      montoTotal: (totalMatch?.[1] ?? '').replace(/,/g, ''),
      concepto: (conceptMatch?.[1]?.trim() ?? lines.slice(0, 3).join(' ')).slice(0, 150),
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

  async extractTextFromBuffer(buffer: Buffer, mimetype: string): Promise<string> {
    try {
      return mimetype === 'application/pdf'
        ? await this.extractPdfText(buffer)
        : await this.extractImageText(buffer);
    } catch (err: any) {
      return `[OCR no disponible: ${err?.message || 'error desconocido'}]`;
    }
  }

  extractHrFields(text: string, tipo: string): Record<string, string> {
    const fields: Record<string, string> = {};
    if (!text || text.startsWith('[OCR')) return fields;

    // CURP — patrón universal presente en varios documentos
    const curpMatch = text.match(/[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9]{2}/);
    if (curpMatch) {
      fields.curp = curpMatch[0];
      // Parsear fecha de nacimiento del CURP (posiciones 4-9: AAMMDD)
      const curp = curpMatch[0];
      const yy = curp.slice(4, 6);
      const mm = curp.slice(6, 8);
      const dd = curp.slice(8, 10);
      const year = parseInt(yy) <= new Date().getFullYear() % 100
        ? 2000 + parseInt(yy)
        : 1900 + parseInt(yy);
      fields.fechaNacimiento = `${year}-${mm}-${dd}`;
      // Parsear género (posición 10: H=Masculino, M=Femenino)
      const sexChar = curp[10];
      fields.genero = sexChar === 'H' ? 'M' : sexChar === 'M' ? 'F' : 'OTRO';
    }

    if (tipo === 'INE') {
      const nombreMatch =
        text.match(/NOMBRE[S]?\s*\n([^\n]+)/i) ||
        text.match(/NOMBRE[S]?[:\s]+([A-ZÁÉÍÓÚÑ ]{5,60})/i);
      if (nombreMatch) fields.nombre = nombreMatch[1].trim();

      const apPat = text.match(/APELLIDO\s*PATERNO[:\s]+([A-ZÁÉÍÓÚÑ ]{2,40})/i);
      const apMat = text.match(/APELLIDO\s*MATERNO[:\s]+([A-ZÁÉÍÓÚÑ ]{2,40})/i);
      if (apPat || apMat) {
        fields.apellidos = [apPat?.[1], apMat?.[1]].filter(Boolean).join(' ').trim();
      }

      const ineMatch =
        text.match(/CIC[:\s]*([0-9]{9,10})/i) ||
        text.match(/\b([0-9]{13})\b/);
      if (ineMatch) fields.numeroIne = ineMatch[1];

      const domMatch = text.match(/DOMICILIO[:\s]+([^\n]{5,100})/i);
      if (domMatch) fields.domicilio = domMatch[1].trim();

      const coloniaMatch = text.match(/COLONIA[:\s]+([^\n]{3,50})/i);
      if (coloniaMatch) fields.colonia = coloniaMatch[1].trim();

      const cpMatch =
        text.match(/C\.?P\.?\s*[:\s]?([0-9]{5})\b/i) ||
        text.match(/\b([0-9]{5})\b/);
      if (cpMatch) fields.codigoPostal = cpMatch[1];

      const ciudadMatch = text.match(/MUNICIPIO[:\s]+([^\n]{3,50})/i) || text.match(/CIUDAD[:\s]+([^\n]{3,50})/i);
      if (ciudadMatch) fields.ciudad = ciudadMatch[1].trim();

      const estadoMatch = text.match(/ESTADO[:\s]+([^\n]{3,40})/i);
      if (estadoMatch) fields.estado = estadoMatch[1].trim();
    }

    if (tipo === 'CURP') {
      const nombreMatch = text.match(/NOMBRE[S]?[:\s]+([A-ZÁÉÍÓÚÑ ]{5,60})/i);
      if (nombreMatch) fields.nombre = nombreMatch[1].trim();

      const apPat = text.match(/PRIMER\s*APELLIDO[:\s]+([A-ZÁÉÍÓÚÑ ]{2,40})/i);
      const apMat = text.match(/SEGUNDO\s*APELLIDO[:\s]+([A-ZÁÉÍÓÚÑ ]{2,40})/i);
      if (apPat || apMat) {
        fields.apellidos = [apPat?.[1], apMat?.[1]].filter(Boolean).join(' ').trim();
      }
    }

    if (tipo === 'COMPROBANTE_DOMICILIO' || tipo === 'RFC') {
      const rfcMatch = text.match(/[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}/i);
      if (rfcMatch) fields.rfc = rfcMatch[0].toUpperCase();

      const cpMatch = text.match(/C\.?P\.?\s*[:\s]?([0-9]{5})\b/i);
      if (cpMatch) fields.codigoPostal = cpMatch[1];

      const coloniaMatch = text.match(/COLONIA[:\s]+([^\n]{3,50})/i);
      if (coloniaMatch) fields.colonia = coloniaMatch[1].trim();

      const ciudadMatch = text.match(/(?:MUNICIPIO|CIUDAD)[:\s]+([^\n]{3,50})/i);
      if (ciudadMatch) fields.ciudad = ciudadMatch[1].trim();

      const estadoMatch = text.match(/ESTADO[:\s]+([^\n]{3,40})/i);
      if (estadoMatch) fields.estado = estadoMatch[1].trim();
    }

    if (tipo === 'NSS') {
      const nssMatch = text.match(/\b([0-9]{11})\b/);
      if (nssMatch) fields.nss = nssMatch[1];
    }

    return fields;
  }
}

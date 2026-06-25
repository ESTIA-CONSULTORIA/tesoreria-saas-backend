import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ContractTemplate } from './entities/contract-template.entity';
import { Contract } from './entities/contract.entity';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const FIELD_MAP: Record<string, (emp: any, company?: any) => string> = {
  nombre_completo: (e) => `${e.nombre || ''} ${e.apellidos || ''}`.trim(),
  nombre: (e) => e.nombre || '',
  apellidos: (e) => e.apellidos || '',
  curp: (e) => e.curp || '',
  rfc: (e) => e.rfc || '',
  numero_imss: (e) => e.imssNumber || e.nss || '',
  fecha_nacimiento: (e) => e.fechaNacimiento ? new Date(e.fechaNacimiento).toLocaleDateString('es-MX') : '',
  domicilio: (e) => e.domicilio || '',
  ciudad: (e) => e.ciudad || '',
  estado: (e) => e.estado || '',
  puesto: (e) => e.puesto || '',
  area: (e) => e.area || e.departamento || '',
  fecha_ingreso: (e) => e.fechaIngreso ? new Date(e.fechaIngreso).toLocaleDateString('es-MX') : '',
  tipo_contrato: (e) => e.tipoContrato || '',
  tipo_jornada: (e) => e.tipoJornada || '',
  turno: (e) => e.turno || '',
  salario_mensual: (e) => e.salarioMensual ? `$${Number(e.salarioMensual).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '',
  salario_diario: (e) => e.salarioDiario || e.salarioDiarioIntegrado ? `$${Number(e.salarioDiario || e.salarioDiarioIntegrado).toFixed(2)}` : '',
  periodo_pago: (e) => e.periodoPago || '',
  empresa: (_e, company) => company?.tradeName || company?.legalName || '',
  sucursal: (e) => e.sucursal || '',
  fecha_contrato: () => new Date().toLocaleDateString('es-MX'),
};

@Injectable()
export class ContractsService {
  constructor(
    @InjectRepository(ContractTemplate)
    private templateRepo: Repository<ContractTemplate>,
    @InjectRepository(Contract)
    private contractRepo: Repository<Contract>,
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  async getTemplates(tenantId: string, companyId?: string) {
    const global = await this.templateRepo.find({
      where: { isGlobal: true, isActive: true },
      select: ['id', 'name', 'fileType', 'detectedFields', 'isGlobal', 'createdAt'],
    });
    const custom = companyId
      ? await this.templateRepo.find({
          where: { tenantId, companyId, isGlobal: false, isActive: true },
          select: ['id', 'name', 'fileType', 'detectedFields', 'isGlobal', 'createdAt'],
        })
      : [];
    return [...global, ...custom];
  }

  async uploadTemplate(dto: {
    tenantId: string;
    companyId: string;
    name: string;
    fileType: string;
    fileBase64: string;
  }) {
    const fields = this.detectFields(dto.fileBase64, dto.fileType);
    return this.templateRepo.save({
      ...dto,
      detectedFields: fields,
      isGlobal: false,
      isActive: true,
    });
  }

  async deleteTemplate(id: string) {
    const t = await this.templateRepo.findOne({ where: { id } });
    if (t?.isGlobal) throw new Error('No se puede eliminar una plantilla global');
    await this.templateRepo.update(id, { isActive: false });
    return { deleted: true };
  }

  private detectFields(base64: string, _fileType: string): string[] {
    try {
      const content = Buffer.from(base64, 'base64').toString('utf-8');
      const matches = content.match(/\{([a-z_]+)\}/g) || [];
      return [...new Set(matches.map(m => m.replace(/\{|\}/g, '')))];
    } catch {
      return [];
    }
  }

  async getContracts(tenantId: string, employeeId?: string, companyId?: string) {
    const where: any = { tenantId };
    if (employeeId) where.employeeId = employeeId;
    if (companyId) where.companyId = companyId;
    return this.contractRepo.find({
      where,
      select: ['id', 'employeeId', 'templateId', 'status', 'signatureLevel', 'signedAt', 'createdAt'],
      order: { createdAt: 'DESC' },
    });
  }

  async generateContract(dto: {
    tenantId: string;
    companyId: string;
    employeeId: string;
    templateId: string;
    signatureLevel: string;
  }) {
    const template = await this.templateRepo.findOne({ where: { id: dto.templateId } });
    if (!template) throw new NotFoundException('Plantilla no encontrada');

    const employeeRows = await this.dataSource.query(
      `SELECT * FROM employee WHERE id = $1 LIMIT 1`,
      [dto.employeeId],
    );
    const employee = employeeRows[0];
    if (!employee) throw new NotFoundException('Empleado no encontrado');

    const companyRows = await this.dataSource.query(
      `SELECT * FROM company WHERE id = $1 LIMIT 1`,
      [dto.companyId],
    );
    const company = companyRows[0];

    const filledPdf = await this.fillPdfTemplate(
      template.fileBase64,
      template.fileType,
      employee,
      company,
    );

    return this.contractRepo.save({
      tenantId: dto.tenantId,
      companyId: dto.companyId,
      employeeId: dto.employeeId,
      templateId: dto.templateId,
      fileType: template.fileType,
      signatureLevel: dto.signatureLevel,
      status: 'PENDIENTE',
      contractPdfBase64: filledPdf,
    });
  }

  private async fillPdfTemplate(
    base64: string,
    fileType: string,
    employee: any,
    company: any,
  ): Promise<string> {
    if (fileType === 'DOCX') {
      return this.fillDocxTemplate(base64, employee, company);
    }
    return this.fillTextInPdf(base64, employee, company);
  }

  private async fillDocxTemplate(base64: string, employee: any, company: any): Promise<string> {
    try {
      const PizZip = require('pizzip');
      const Docxtemplater = require('docxtemplater');

      const data: Record<string, string> = {};
      for (const [key, fn] of Object.entries(FIELD_MAP)) {
        data[key] = fn(employee, company);
      }

      const zip = new PizZip(Buffer.from(base64, 'base64'));
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: '{', end: '}' },
      });
      doc.setData(data);
      doc.render();
      const buf = doc.getZip().generate({ type: 'nodebuffer' });
      return buf.toString('base64');
    } catch (e: any) {
      console.error('Error filling DOCX:', e.message);
      return base64;
    }
  }

  private async fillTextInPdf(base64: string, _employee: any, _company: any): Promise<string> {
    try {
      const pdfBytes = Buffer.from(base64, 'base64');
      await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      return pdfBytes.toString('base64');
    } catch {
      return base64;
    }
  }

  async signContract(dto: {
    contractId: string;
    signatureBase64: string;
    selfieBase64?: string;
    ineFrontBase64?: string;
    ineBackBase64?: string;
    ip: string;
    lat?: number;
    lng?: number;
  }) {
    const contract = await this.contractRepo.findOne({ where: { id: dto.contractId } });
    if (!contract) throw new NotFoundException('Contrato no encontrado');

    const signedPdf = await this.generateSignedPdf(contract, dto);

    await this.contractRepo.update(dto.contractId, {
      status: 'FIRMADO',
      signatureBase64: dto.signatureBase64,
      selfieBase64: dto.selfieBase64,
      ineFrontBase64: dto.ineFrontBase64,
      ineBackBase64: dto.ineBackBase64,
      signedAt: new Date(),
      signedIp: dto.ip,
      signedLat: dto.lat,
      signedLng: dto.lng,
      signedPdfBase64: signedPdf,
    });

    return this.contractRepo.findOne({ where: { id: dto.contractId } });
  }

  private async generateSignedPdf(contract: Contract, signData: any): Promise<string> {
    try {
      const pdfBytes = Buffer.from(contract.contractPdfBase64, 'base64');
      const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const pages = pdfDoc.getPages();
      const lastPage = pages[pages.length - 1];
      const { width, height } = lastPage.getSize();

      let signatureImage: any;
      try {
        const sigBytes = Buffer.from(
          signData.signatureBase64.replace(/^data:image\/\w+;base64,/, ''),
          'base64',
        );
        signatureImage = await pdfDoc.embedPng(sigBytes);
      } catch { /* firma no embebible */ }

      const evidencePage = pdfDoc.addPage([width, height]);
      let y = height - 60;

      evidencePage.drawText('CONSTANCIA DE FIRMA ELECTRÓNICA', {
        x: 50, y, font, size: 14, color: rgb(0, 0, 0),
      });
      y -= 30;

      const meta = [
        `Fecha y hora: ${new Date().toLocaleString('es-MX')}`,
        `IP: ${signData.ip || 'N/D'}`,
        `Geolocalización: ${signData.lat ? `${signData.lat}, ${signData.lng}` : 'N/D'}`,
        `Nivel de firma: ${contract.signatureLevel}`,
      ];

      for (const line of meta) {
        evidencePage.drawText(line, { x: 50, y, font, size: 10, color: rgb(0.2, 0.2, 0.2) });
        y -= 20;
      }

      if (signatureImage) {
        y -= 20;
        evidencePage.drawText('Firma del empleado:', { x: 50, y, font, size: 10, color: rgb(0.2, 0.2, 0.2) });
        y -= 80;
        evidencePage.drawImage(signatureImage, { x: 50, y, width: 200, height: 70 });
      }

      if (signData.selfieBase64) {
        try {
          const selfieBytes = Buffer.from(
            signData.selfieBase64.replace(/^data:image\/\w+;base64,/, ''),
            'base64',
          );
          let selfieImg: any;
          try {
            selfieImg = await pdfDoc.embedJpg(selfieBytes);
          } catch {
            selfieImg = await pdfDoc.embedPng(selfieBytes);
          }
          y -= 100;
          evidencePage.drawText('Fotografía del firmante:', { x: 50, y, font, size: 10, color: rgb(0.2, 0.2, 0.2) });
          y -= 90;
          evidencePage.drawImage(selfieImg, { x: 50, y, width: 80, height: 80 });
        } catch { /* selfie no embebible */ }
      }

      const signedBytes = await pdfDoc.save();
      return Buffer.from(signedBytes).toString('base64');
    } catch (e: any) {
      console.error('Error generating signed PDF:', e.message);
      return contract.contractPdfBase64;
    }
  }

  async getContractPdf(contractId: string) {
    const contract = await this.contractRepo.findOne({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('Contrato no encontrado');
    return {
      id: contract.id,
      status: contract.status,
      pdf: contract.signedPdfBase64 || contract.contractPdfBase64,
      fileType: 'PDF',
    };
  }
}

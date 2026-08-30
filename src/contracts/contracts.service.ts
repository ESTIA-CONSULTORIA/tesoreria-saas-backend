import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ContractTemplate } from './entities/contract-template.entity';
import { Contract } from './entities/contract.entity';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { StorageService } from '../storage/storage.service';
import { OcrService } from '../ocr/ocr.service';
import { ModulesService } from '../modules/modules.service';
import { FACE_MATCH_PROVIDER, type FaceMatchProvider } from './face-match/face-match-provider.interface';

const FIELD_MAP: Record<string, (emp: any, company?: any, branch?: any) => string> = {
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
  sucursal: (_e, _company, branch) => branch?.name || '',
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
    private readonly storageService: StorageService,
    private readonly ocrService: OcrService,
    private readonly modulesService: ModulesService,
    @Inject(FACE_MATCH_PROVIDER)
    private readonly faceMatchProvider: FaceMatchProvider,
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
    const fields = await this.detectFields(dto.fileBase64, dto.fileType);
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

  // Auditoría de producto (GoodsHabits, Fase 3 — Contratos): para PDF, ahora lee los
  // nombres reales de los campos del AcroForm en vez de aplicar el mismo regex de
  // marcadores {campo} que usa DOCX — ese regex nunca fue confiable contra bytes binarios
  // de un PDF. DOCX no cambia: sigue funcionando porque un .docx guarda su texto sin
  // comprimir en muchos casos, y esa detección ya está verificada en producción.
  private async detectFields(base64: string, fileType: string): Promise<string[]> {
    if (fileType === 'PDF') {
      try {
        const pdfDoc = await PDFDocument.load(Buffer.from(base64, 'base64'), { ignoreEncryption: true });
        const form = pdfDoc.getForm();
        return form.getFields().map((f) => f.getName());
      } catch {
        return []; // sin AcroForm — plantilla PDF sin campos rellenables, válido pero nada que detectar
      }
    }
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

    const branch = employee.branchId
      ? await this.dataSource.query(
          `SELECT * FROM branch WHERE id = $1 LIMIT 1`,
          [employee.branchId],
        ).then((rows: any[]) => rows[0])
      : null;

    const filledPdf = await this.fillPdfTemplate(
      template.fileBase64,
      template.fileType,
      employee,
      company,
      branch,
    );

    const contract = await this.contractRepo.save({
      tenantId: dto.tenantId,
      companyId: dto.companyId,
      employeeId: dto.employeeId,
      templateId: dto.templateId,
      fileType: template.fileType,
      signatureLevel: dto.signatureLevel,
      status: 'PENDIENTE',
    });

    // Auditoría de producto (GoodsHabits, Fase 3): el PDF generado ya no vive en una
    // columna de Contract — se guarda vía StorageService, StoredFile lo referencia por
    // ownerId + role. El contrato necesita existir primero para tener un id que usar como
    // ownerId.
    await this.storageService.upload({
      tenantId: dto.tenantId,
      ownerType: 'contract',
      ownerId: contract.id,
      role: 'contract_pdf',
      data: filledPdf,
      mimeType: template.fileType === 'DOCX'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/pdf',
      folder: `estia/contracts/${contract.id}`,
      fileName: 'contract_pdf',
    });

    return contract;
  }

  private async fillPdfTemplate(
    base64: string,
    fileType: string,
    employee: any,
    company: any,
    branch?: any,
  ): Promise<string> {
    if (fileType === 'DOCX') {
      return this.fillDocxTemplate(base64, employee, company, branch);
    }
    return this.fillPdfFormTemplate(base64, employee, company, branch);
  }

  private async fillDocxTemplate(base64: string, employee: any, company: any, branch?: any): Promise<string> {
    try {
      const PizZip = require('pizzip');
      const Docxtemplater = require('docxtemplater');

      const data: Record<string, string> = {};
      for (const [key, fn] of Object.entries(FIELD_MAP)) {
        data[key] = fn(employee, company, branch);
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

  // Auditoría de producto (GoodsHabits, Fase 3 — Contratos): reemplaza el passthrough que
  // no llenaba nada. Rellena campos de formulario reales (AcroForm) — el formato que un
  // despacho legal/RH ya produce desde Acrobat/Word ("Guardar como PDF con campos de
  // formulario"). Mapea cada campo del PDF por su NOMBRE contra el mismo FIELD_MAP que ya
  // usa el lado DOCX — una plantilla PDF necesita nombrar sus campos igual que los
  // marcadores {campo} del lado DOCX (ej. un campo de formulario llamado "nombre_completo").
  // Al final aplana el formulario (form.flatten()) — el contrato generado queda como texto
  // fijo, no como un formulario que el empleado podría reabrir y editar antes de firmar.
  private async fillPdfFormTemplate(base64: string, employee: any, company: any, branch?: any): Promise<string> {
    try {
      const pdfBytes = Buffer.from(base64, 'base64');
      const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

      let form;
      try {
        form = pdfDoc.getForm();
      } catch {
        // Sin AcroForm en el PDF (ej. un PDF escaneado o de solo texto) — no hay nada que
        // rellenar, se devuelve el original intacto, mismo comportamiento que el
        // passthrough anterior para este caso.
        return pdfBytes.toString('base64');
      }

      const fields = form.getFields();
      if (fields.length === 0) {
        return pdfBytes.toString('base64');
      }

      let filledCount = 0;
      for (const field of fields) {
        const fieldName = field.getName();
        const resolver = FIELD_MAP[fieldName];
        if (!resolver) continue; // campo del PDF sin marcador correspondiente — se deja como está

        const value = resolver(employee, company, branch);
        try {
          const textField = form.getTextField(fieldName);
          textField.setText(value);
          filledCount++;
        } catch {
          // El campo existe pero no es de texto (checkbox, dropdown...) — fuera de alcance
          // de esta fase, se deja sin tocar en vez de fallar la generación completa.
        }
      }

      if (filledCount > 0) {
        form.flatten();
      }

      const filledBytes = await pdfDoc.save();
      return Buffer.from(filledBytes).toString('base64');
    } catch (e: any) {
      console.error('Error llenando plantilla PDF:', e.message);
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

    // Auditoría de producto (GoodsHabits, Fase 3 — Firma electrónica): validación facial
    // opcional — gateada por el módulo 'validacion_facial' (apagado por default en todos
    // los planes), y solo corre si ambos insumos llegaron. NullFaceMatchProvider (único
    // proveedor de esta fase) devuelve score: null — el campo se guarda igual, sin
    // pretender un resultado real.
    let faceMatchScore: number | null = null;
    if (dto.selfieBase64 && dto.ineFrontBase64) {
      const hasFaceMatch = await this.modulesService.hasModule(contract.tenantId, 'validacion_facial');
      if (hasFaceMatch) {
        try {
          const result = await this.faceMatchProvider.compare(
            this.toBuffer(dto.selfieBase64),
            this.toBuffer(dto.ineFrontBase64),
          );
          faceMatchScore = result.score;
        } catch (e: any) {
          console.error('Error en validación facial:', e.message);
        }
      }
    }

    const evidencePdf = await this.buildEvidencePdf(contract, dto, faceMatchScore);
    const folder = `estia/contracts/${dto.contractId}`;

    // Auditoría de producto (GoodsHabits, Fase 3 — Firma electrónica): cada archivo
    // capturado en la firma se sube por separado vía StorageService, con su propio role.
    // La constancia ('evidence_pdf') es un documento SEPARADO generado desde cero — ya no
    // se intenta insertar páginas dentro de contractPdfBase64 (que para plantillas DOCX,
    // la única que funciona hoy, nunca fue un PDF real — ver Falta 5 del diseño: eso
    // hacía fallar la generación en silencio y guardaba el original sin firma como si
    // fuera el "firmado"). signatureBase64/selfieBase64/ineFrontBase64/ineBackBase64 solo
    // se guardan si vienen en el body — la selfie e INE son opcionales según el nivel de
    // firma.
    const uploads: Array<Promise<unknown>> = [
      this.storageService.upload({
        tenantId: contract.tenantId, ownerType: 'contract', ownerId: contract.id, role: 'signature',
        data: dto.signatureBase64, mimeType: 'image/png', folder, fileName: 'signature',
      }),
      this.storageService.upload({
        tenantId: contract.tenantId, ownerType: 'contract', ownerId: contract.id, role: 'evidence_pdf',
        data: evidencePdf, mimeType: 'application/pdf', folder, fileName: `evidencia_${dto.contractId}`,
      }),
    ];
    if (dto.selfieBase64) {
      uploads.push(this.storageService.upload({
        tenantId: contract.tenantId, ownerType: 'contract', ownerId: contract.id, role: 'selfie',
        data: dto.selfieBase64, mimeType: 'image/jpeg', folder, fileName: 'selfie',
      }));
    }
    if (dto.ineFrontBase64) {
      uploads.push(this.storageService.upload({
        tenantId: contract.tenantId, ownerType: 'contract', ownerId: contract.id, role: 'ine_front',
        data: dto.ineFrontBase64, mimeType: 'image/jpeg', folder, fileName: 'ine_front',
      }));
    }
    if (dto.ineBackBase64) {
      uploads.push(this.storageService.upload({
        tenantId: contract.tenantId, ownerType: 'contract', ownerId: contract.id, role: 'ine_back',
        data: dto.ineBackBase64, mimeType: 'image/jpeg', folder, fileName: 'ine_back',
      }));
    }
    await Promise.all(uploads);

    await this.contractRepo.update(dto.contractId, {
      status: 'FIRMADO',
      signedAt: new Date(),
      signedIp: dto.ip,
      signedLat: dto.lat,
      signedLng: dto.lng,
      faceMatchScore: faceMatchScore ?? undefined,
    });

    return this.contractRepo.findOne({ where: { id: dto.contractId } });
  }

  // Acepta tanto un data URI completo (canvas.toDataURL(), FileReader.readAsDataURL()) como
  // base64 puro — mismo criterio que Base64PostgresProvider.toBase64().
  private toBuffer(base64OrDataUrl: string): Buffer {
    const match = base64OrDataUrl.match(/^data:([^;]+);base64,(.+)$/s);
    return Buffer.from(match ? match[2] : base64OrDataUrl, 'base64');
  }

  // Auditoría de producto (GoodsHabits, Fase 3 — Firma electrónica): PDF de evidencia
  // SEPARADO del contrato — decisión explícita tras el bug de Falta 5. Se genera desde
  // cero (PDFDocument.create()), nunca carga/modifica el documento del contrato — así
  // funciona igual sin importar si la plantilla original era DOCX o PDF.
  private async buildEvidencePdf(
    contract: Contract,
    signData: { ip: string; lat?: number; lng?: number; signatureBase64: string; selfieBase64?: string },
    faceMatchScore: number | null,
  ): Promise<string> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    let y = 740;

    const draw = (text: string, opts: { size?: number; b?: boolean; color?: [number, number, number] } = {}) => {
      page.drawText(text, {
        x: 50, y, size: opts.size ?? 10, font: opts.b ? bold : font,
        color: rgb(...(opts.color ?? [0, 0, 0])),
      });
      y -= (opts.size ?? 10) + 8;
    };

    draw('CONSTANCIA DE FIRMA ELECTRÓNICA', { size: 16, b: true });
    y -= 4;
    draw(`Contrato: ${contract.id}`, { size: 9, color: [0.4, 0.4, 0.4] });
    draw(`Fecha y hora: ${new Date().toLocaleString('es-MX')}`);
    draw(`IP: ${signData.ip || 'N/D'}`);
    draw(`Geolocalización: ${signData.lat ? `${signData.lat}, ${signData.lng}` : 'N/D'}`);
    draw(`Nivel de firma: ${contract.signatureLevel}`);
    if (faceMatchScore !== null) {
      draw(`Validación facial (score): ${faceMatchScore}`);
    }
    y -= 12;

    try {
      const sigImg = await pdfDoc.embedPng(this.toBuffer(signData.signatureBase64));
      draw('Firma del empleado:', { b: true });
      y -= 80;
      page.drawImage(sigImg, { x: 50, y, width: 200, height: 70 });
      y -= 10;
    } catch (e: any) {
      console.error('Firma no embebible en la constancia:', e.message);
    }

    if (signData.selfieBase64) {
      try {
        const selfieBytes = this.toBuffer(signData.selfieBase64);
        let selfieImg;
        try {
          selfieImg = await pdfDoc.embedJpg(selfieBytes);
        } catch {
          selfieImg = await pdfDoc.embedPng(selfieBytes);
        }
        draw('Fotografía del firmante:', { b: true });
        y -= 90;
        page.drawImage(selfieImg, { x: 50, y, width: 80, height: 80 });
      } catch (e: any) {
        console.error('Selfie no embebible en la constancia:', e.message);
      }
    }

    const bytes = await pdfDoc.save();
    return Buffer.from(bytes).toString('base64');
  }

  async getContractPdf(contractId: string) {
    const contract = await this.contractRepo.findOne({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('Contrato no encontrado');

    // Prioridad: PDF firmado si ya existe, si no el generado sin firmar — mismo criterio
    // que antes (signedPdfBase64 || contractPdfBase64), ahora resuelto vía StoredFile.
    const signedFile = await this.storageService.getOneByOwner('contract', contract.id, 'signed_pdf');
    const file = signedFile ?? await this.storageService.getOneByOwner('contract', contract.id, 'contract_pdf');
    const content = file ? await this.storageService.getContent(file.id) : null;

    return {
      id: contract.id,
      status: contract.status,
      pdf: content?.base64 || content?.url || null,
      fileType: 'PDF',
    };
  }

  async getEvidencePdf(contractId: string) {
    const contract = await this.contractRepo.findOne({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('Contrato no encontrado');
    const file = await this.storageService.getOneByOwner('contract', contract.id, 'evidence_pdf');
    if (!file) throw new NotFoundException('Este contrato no tiene constancia de firma generada');
    const content = await this.storageService.getContent(file.id);
    return { id: contract.id, pdf: content?.base64 || content?.url || null, fileType: 'PDF' };
  }

  // ═══════════════════════════════════════════════════════════════
  // Portal del empleado — Fase 3, Firma electrónica
  // ═══════════════════════════════════════════════════════════════

  // Mismo patrón que HrService.findEmployeeByUserId() — Employee.userId es el vínculo con
  // la sesión del Portal. Repositorio directo vía dataSource, no un import de HrModule
  // completo (evita acoplar ContractsModule a RH más de lo que ya está por convención).
  async resolveEmployeeIdFromUser(userId: string): Promise<string | null> {
    if (!userId) return null;
    const employeeRepo = this.dataSource.getRepository('Employee');
    const emp = await employeeRepo.findOne({ where: { userId } });
    return emp?.id ?? null;
  }

  getPortalContracts(employeeId: string) {
    return this.contractRepo.find({
      where: { employeeId },
      select: ['id', 'templateId', 'status', 'signatureLevel', 'signedAt', 'createdAt'],
      order: { createdAt: 'DESC' },
    });
  }

  // Auditoría de producto (GoodsHabits, Fase 3 — Firma electrónica): compara el INE que el
  // empleado sube por el Portal contra su expediente YA existente — a diferencia de
  // hr.service.ts::ocrDocument()/confirmOcr(), que llenan el expediente desde cero. Nunca
  // escribe en Employee — solo reporta discrepancias para que la firma quede bloqueada
  // hasta revisión humana si algo no coincide.
  async verifyIneForEmployee(employeeId: string, ineFrontBase64: string, tipo = 'INE') {
    const employeeRepo = this.dataSource.getRepository('Employee');
    const employee: any = await employeeRepo.findOne({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException('Empleado no encontrado');

    const matches = ineFrontBase64.match(/^data:([^;]+);base64,(.+)$/s);
    const mimetype = matches?.[1] || 'image/jpeg';
    const buffer = this.toBuffer(ineFrontBase64);

    const rawText = await this.ocrService.extractTextFromBuffer(buffer, mimetype);
    const extracted = this.ocrService.extractHrFields(rawText, tipo);
    const comparison = this.ocrService.compareToEmployee(extracted, employee);

    return { extracted, comparison, allMatch: comparison.every((c) => c.match) };
  }

  async signContractAsEmployee(dto: Parameters<ContractsService['signContract']>[0] & { employeeId: string }) {
    const contract = await this.contractRepo.findOne({ where: { id: dto.contractId } });
    if (!contract) throw new NotFoundException('Contrato no encontrado');
    // Auditoría de seguridad (GoodsHabits, Fase 3 — Firma electrónica, Falta 4):
    // signContract() nunca validó dueño porque solo lo llamaba RH (admin, supervisando o
    // firmando en nombre de). Expuesto al Portal, un empleado no debe poder firmar el
    // contrato de otro cambiando el :id en la URL.
    if (contract.employeeId !== dto.employeeId) {
      throw new ForbiddenException('No puedes firmar el contrato de otro empleado');
    }
    return this.signContract(dto);
  }

  async getEvidencePdfForEmployee(contractId: string, employeeId: string) {
    const contract = await this.contractRepo.findOne({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('Contrato no encontrado');
    if (contract.employeeId !== employeeId) {
      throw new ForbiddenException('No puedes ver la constancia de firma de otro empleado');
    }
    return this.getEvidencePdf(contractId);
  }
}

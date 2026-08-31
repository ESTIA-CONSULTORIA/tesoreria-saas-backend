import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { PayrollRun } from './entities/payroll-run.entity';
import { PayrollEntry } from './entities/payroll-entry.entity';
import { PayrollConceptTemplate } from './entities/payroll-concept-template.entity';
import { EmployeeIncapacity } from './entities/employee-incapacity.entity';
import { StorageService } from '../storage/storage.service';
import { DispersionEntry } from './layout-formatters/payroll-layout-formatter.interface';
import { getLayoutFormatter, REGISTERED_BANKS } from './layout-formatters/registry';

@Injectable()
export class PayrollService {
  constructor(
    @InjectRepository(PayrollRun)
    private runRepo: Repository<PayrollRun>,
    @InjectRepository(PayrollEntry)
    private entryRepo: Repository<PayrollEntry>,
    @InjectRepository(PayrollConceptTemplate)
    private conceptRepo: Repository<PayrollConceptTemplate>,
    @InjectRepository(EmployeeIncapacity)
    private incapacityRepo: Repository<EmployeeIncapacity>,
    @InjectDataSource()
    private dataSource: DataSource,
    private readonly storageService: StorageService,
  ) {}

  async createPayrollRun(
    dto: {
      periodStart: string;
      periodEnd: string;
      periodType?: string;
      notes?: string;
    },
    tenantId: string,
    companyId: string,
    branchId: string,
  ): Promise<{ run: PayrollRun; entries: PayrollEntry[] }> {
    const run = await this.runRepo.save(
      this.runRepo.create({
        tenantId,
        companyId,
        branchId,
        periodStart: dto.periodStart,
        periodEnd: dto.periodEnd,
        periodType: dto.periodType || 'QUINCENAL',
        status: 'PRENOMINA',
        notes: dto.notes,
        totalAmount: 0,
      }),
    );

    const employeeRepo = this.dataSource.getRepository('Employee');
    const employees: any[] = await employeeRepo.find({
      where: { branchId, status: 'ACTIVO' },
    });

    const entries: PayrollEntry[] = [];

    for (const emp of employees) {
      const attendanceRows: any[] = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM attendance
         WHERE "employeeId" = $1
           AND date >= $2 AND date <= $3
           AND status IN ('PRESENTE', 'TARDANZA', 'JUSTIFICADO')`,
        [emp.id, dto.periodStart, dto.periodEnd],
      );
      const workedDays = parseInt(attendanceRows[0]?.count || '0', 10);
      const dailySalary = Number(emp.salarioDiarioIntegrado || 0);

      const templates = await this.conceptRepo.find({
        where: { employeeId: emp.id, isActive: true },
      });

      const concepts = templates.map((t) => ({
        name: t.name,
        type: t.type,
        amount: Number(t.defaultAmount),
        saved: true,
      }));

      const perceptionConcepts = concepts.filter((c) => c.type === 'P');
      const deductionConcepts = concepts.filter((c) => c.type === 'D');

      const totalPerceptions =
        dailySalary * workedDays +
        perceptionConcepts.reduce((s, c) => s + c.amount, 0);
      const totalDeductions = deductionConcepts.reduce((s, c) => s + c.amount, 0);
      const netAmount = totalPerceptions - totalDeductions;

      const entry = await this.entryRepo.save(
        this.entryRepo.create({
          payrollRunId: run.id,
          employeeId: emp.id,
          tenantId,
          workedDays,
          dailySalary,
          totalPerceptions,
          totalDeductions,
          netAmount,
          concepts,
          status: 'PENDIENTE',
        }),
      );
      entries.push(entry);
    }

    const totalAmount = entries.reduce((s, e) => s + Number(e.netAmount), 0);
    await this.runRepo.update(run.id, { totalAmount });
    run.totalAmount = totalAmount;

    return { run, entries };
  }

  async getPayrollRun(id: string): Promise<{ run: PayrollRun; entries: PayrollEntry[] }> {
    const run = await this.runRepo.findOne({ where: { id } });
    if (!run) throw new NotFoundException('Corrida de nómina no encontrada');
    const entries = await this.entryRepo.find({ where: { payrollRunId: id } });
    return { run, entries };
  }

  listPayrollRuns(tenantId: string, companyId?: string): Promise<PayrollRun[]> {
    const where: any = { tenantId };
    if (companyId) where.companyId = companyId;
    return this.runRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async updatePayrollEntry(
    entryId: string,
    concepts: Array<{ name: string; type: string; amount: number; saved?: boolean }>,
  ): Promise<PayrollEntry> {
    const entry = await this.entryRepo.findOne({ where: { id: entryId } });
    if (!entry) throw new NotFoundException('Entry de nómina no encontrado');

    const totalPerceptions =
      Number(entry.dailySalary) * entry.workedDays +
      concepts.filter((c) => c.type === 'P').reduce((s, c) => s + Number(c.amount), 0);
    const totalDeductions = concepts
      .filter((c) => c.type === 'D')
      .reduce((s, c) => s + Number(c.amount), 0);
    const netAmount = totalPerceptions - totalDeductions;

    await this.entryRepo.update(entryId, {
      concepts: concepts as any,
      totalPerceptions,
      totalDeductions,
      netAmount,
      status: 'REVISADO',
    });

    const allEntries = await this.entryRepo.find({ where: { payrollRunId: entry.payrollRunId } });
    const updatedEntry = allEntries.find((e) => e.id === entryId)!;
    updatedEntry.totalPerceptions = totalPerceptions;
    updatedEntry.totalDeductions = totalDeductions;
    updatedEntry.netAmount = netAmount;

    const totalAmount = allEntries.reduce(
      (s, e) => s + (e.id === entryId ? netAmount : Number(e.netAmount)),
      0,
    );
    await this.runRepo.update(entry.payrollRunId, { totalAmount });

    return updatedEntry;
  }

  async approvePayrollRun(id: string, approvedBy: string): Promise<PayrollRun> {
    const run = await this.runRepo.findOne({ where: { id } });
    if (!run) throw new NotFoundException('Corrida de nómina no encontrada');
    if (run.status !== 'PRENOMINA') {
      throw new BadRequestException('Solo se puede aprobar una prenómina');
    }

    await this.entryRepo
      .createQueryBuilder()
      .update()
      .set({ status: 'REVISADO' })
      .where('"payrollRunId" = :id AND status = :s', { id, s: 'PENDIENTE' })
      .execute();

    await this.runRepo.update(id, {
      status: 'APROBADA',
      approvedBy,
      approvedAt: new Date(),
    });

    return this.runRepo.findOne({ where: { id } }) as Promise<PayrollRun>;
  }

  async confirmPayment(id: string, bankId: string, tenantId: string): Promise<PayrollRun> {
    const run = await this.runRepo.findOne({ where: { id } });
    if (!run) throw new NotFoundException('Corrida de nómina no encontrada');
    if (run.status !== 'APROBADA') {
      throw new BadRequestException('Solo se puede confirmar el pago de una nómina aprobada');
    }

    const concept = `NOMINA ${run.periodStart} al ${run.periodEnd}`;
    await this.dataSource.query(
      `INSERT INTO movement (id, "accountId", type, amount, concept, date, "tenantId", "createdAt")
       VALUES (gen_random_uuid(), $1, 'EXPENSE', $2, $3, NOW(), $4, NOW())`,
      [bankId, run.totalAmount, concept, tenantId],
    );

    await this.runRepo.update(id, {
      status: 'PAGADA',
      paidFromBankId: bankId,
    });

    await this.entryRepo
      .createQueryBuilder()
      .update()
      .set({ status: 'PAGADO' })
      .where('"payrollRunId" = :id', { id })
      .execute();

    return this.runRepo.findOne({ where: { id } }) as Promise<PayrollRun>;
  }

  // Auditoría de producto (GoodsHabits, Fase 3 — Nómina, addon 'dispersion_bancaria'):
  // mismo efecto final que confirmPayment() (corrida queda PAGADA) pero un movimiento POR
  // EMPLEADO en vez de uno solo con el total — así el estado de cuenta real del banco se
  // puede conciliar línea por línea contra la nómina. El ERP no tiene ninguna integración
  // con un riel de pago real (SPEI o similar, confirmado en el diseño de esta fase) — esto
  // sigue siendo un registro contable, el pago real lo ejecuta el cliente por fuera.
  async confirmPaymentPerEmployee(id: string, bankId: string, tenantId: string): Promise<PayrollRun> {
    const run = await this.runRepo.findOne({ where: { id } });
    if (!run) throw new NotFoundException('Corrida de nómina no encontrada');
    if (run.status !== 'APROBADA') {
      throw new BadRequestException('Solo se puede confirmar el pago de una nómina aprobada');
    }

    const entries = await this.entryRepo.find({ where: { payrollRunId: id } });
    const employeeRepo = this.dataSource.getRepository('Employee');
    const employees: any[] = await employeeRepo.find({
      where: { id: In(entries.map((e) => e.employeeId)) },
    });
    const employeeById = new Map(employees.map((e) => [e.id, e]));

    for (const entry of entries) {
      const emp = employeeById.get(entry.employeeId);
      const empName = emp ? `${emp.nombre} ${emp.apellidos || ''}`.trim() : entry.employeeId;
      const concept = `NOMINA ${run.periodStart} al ${run.periodEnd} - ${empName}`;
      await this.dataSource.query(
        `INSERT INTO movement (id, "accountId", type, category, amount, concept, reference, date, "tenantId", "createdAt")
         VALUES (gen_random_uuid(), $1, 'EXPENSE', 'PAYROLL', $2, $3, $4, NOW(), $5, NOW())`,
        [bankId, entry.netAmount, concept, entry.employeeId, tenantId],
      );
    }

    await this.runRepo.update(id, { status: 'PAGADA', paidFromBankId: bankId });
    await this.entryRepo
      .createQueryBuilder()
      .update()
      .set({ status: 'PAGADO' })
      .where('"payrollRunId" = :id', { id })
      .execute();

    return this.runRepo.findOne({ where: { id } }) as Promise<PayrollRun>;
  }

  // Auditoría de producto (GoodsHabits, Fase 3 — Nómina, addon 'dispersion_layout'):
  // genera el archivo que el cliente sube al portal de banca empresarial de su banco — este
  // es el modo que sí ejecuta dispersión real (el banco paga), a diferencia del modo
  // anterior que solo registra el asiento contable. No cambia el status de la corrida ni
  // crea movimientos — es una exportación, el pago lo confirma quien suba el archivo al
  // banco y luego marque la corrida como pagada por el modo que corresponda.
  async generateLayoutFile(id: string, bankCode: string): Promise<{ fileName: string; content: string; mimeType: string }> {
    const run = await this.runRepo.findOne({ where: { id } });
    if (!run) throw new NotFoundException('Corrida de nómina no encontrada');
    if (run.status !== 'APROBADA' && run.status !== 'PAGADA') {
      throw new BadRequestException('La corrida debe estar aprobada para generar el archivo de dispersión');
    }

    const entries = await this.entryRepo.find({ where: { payrollRunId: id } });
    const employeeRepo = this.dataSource.getRepository('Employee');
    const employees: any[] = await employeeRepo.find({
      where: { id: In(entries.map((e) => e.employeeId)) },
    });
    const employeeById = new Map(employees.map((e) => [e.id, e]));

    const dispersionEntries: DispersionEntry[] = entries.map((entry) => {
      const emp = employeeById.get(entry.employeeId);
      return {
        employeeName: emp ? `${emp.nombre} ${emp.apellidos || ''}`.trim() : entry.employeeId,
        clabe: emp?.clabe || '',
        banco: emp?.banco || '',
        amount: Number(entry.netAmount),
        reference: `NOM-${run.periodStart}-${entry.employeeId.slice(0, 8)}`,
        rfc: emp?.rfc || '',
      };
    });

    const missingClabe = dispersionEntries.filter((e) => !e.clabe);
    if (missingClabe.length > 0) {
      throw new BadRequestException(
        `${missingClabe.length} empleado(s) sin CLABE registrada en su expediente — complétala antes de generar el archivo.`,
      );
    }

    const formatter = getLayoutFormatter(bankCode);
    return formatter.format(dispersionEntries);
  }

  getRegisteredBanks() {
    return REGISTERED_BANKS;
  }

  getConceptTemplates(employeeId: string, tenantId: string): Promise<PayrollConceptTemplate[]> {
    return this.conceptRepo.find({
      where: { employeeId, tenantId, isActive: true },
      order: { createdAt: 'ASC' },
    });
  }

  async saveConceptTemplate(
    dto: { employeeId: string; name: string; type: string; defaultAmount: number; id?: string },
    tenantId: string,
  ): Promise<PayrollConceptTemplate> {
    if (dto.id) {
      await this.conceptRepo.update(dto.id, {
        name: dto.name,
        type: dto.type,
        defaultAmount: dto.defaultAmount,
      });
      return this.conceptRepo.findOne({ where: { id: dto.id } }) as Promise<PayrollConceptTemplate>;
    }
    return this.conceptRepo.save(
      this.conceptRepo.create({
        tenantId,
        employeeId: dto.employeeId,
        name: dto.name,
        type: dto.type,
        defaultAmount: dto.defaultAmount,
        isActive: true,
      }),
    );
  }

  async deleteConceptTemplate(id: string): Promise<void> {
    await this.conceptRepo.delete(id);
  }

  async getCatalog(tenantId: string, companyId?: string) {
    const global = await this.conceptRepo.find({
      where: { isGlobal: true, isActive: true },
      order: { type: 'ASC', name: 'ASC' },
    });
    const custom = companyId
      ? await this.conceptRepo.find({
          where: { tenantId, companyId, isGlobal: false, isActive: true },
          order: { type: 'ASC', name: 'ASC' },
        })
      : [];
    return [...global, ...custom];
  }

  async saveCatalogConcept(dto: {
    id?: string;
    tenantId: string;
    companyId: string;
    name: string;
    type: string;
    defaultAmount: number;
    category?: string;
  }) {
    if (dto.id) {
      const existing = await this.conceptRepo.findOne({ where: { id: dto.id } });
      if (existing?.isGlobal) throw new Error('No se puede modificar un concepto global');
      await this.conceptRepo.update(dto.id, {
        name: dto.name,
        type: dto.type,
        defaultAmount: dto.defaultAmount,
        category: dto.category,
      });
      return this.conceptRepo.findOne({ where: { id: dto.id } });
    }
    return this.conceptRepo.save({
      tenantId: dto.tenantId,
      companyId: dto.companyId,
      name: dto.name,
      type: dto.type,
      defaultAmount: dto.defaultAmount,
      category: dto.category,
      isGlobal: false,
      isActive: true,
    });
  }

  async deleteCatalogConcept(id: string) {
    const existing = await this.conceptRepo.findOne({ where: { id } });
    if (existing?.isGlobal) throw new Error('No se puede eliminar un concepto global');
    await this.conceptRepo.update(id, { isActive: false });
    return { deleted: true };
  }

  async isPeriodLocked(branchId: string, date: string): Promise<boolean> {
    const runs = await this.runRepo.find({
      where: { branchId, status: 'PAGADA' },
    });
    return runs.some(run => date >= run.periodStart && date <= run.periodEnd);
  }

  async createIncapacity(
    dto: {
      employeeId: string;
      startDate: string;
      endDate: string;
      days: number;
      type: string;
      imssFileNumber?: string;
      diagnosis?: string;
      notes?: string;
    },
    tenantId: string,
  ): Promise<EmployeeIncapacity> {
    return this.incapacityRepo.save(
      this.incapacityRepo.create({ ...dto, tenantId }),
    );
  }

  getIncapacities(employeeId: string, tenantId: string): Promise<EmployeeIncapacity[]> {
    return this.incapacityRepo.find({
      where: { employeeId, tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  // Auditoría de producto (GoodsHabits, Fase 3 — Nómina): recibo individual como PDF real
  // (antes solo existía como impresión de navegador vía PayrollPrint.tsx — el empleado no
  // podía verlo ni descargarlo por su cuenta). Mismo layout y mismo criterio "no fiscal" que
  // PayrollPrint.tsx: montos, conceptos libres, sin retenciones calculadas ni folio fiscal.
  // Se guarda como HrDocument (tipo RECIBO_NOMINA) — reutiliza el mecanismo que ya alimenta
  // GET /hr/portal/documents, así que el empleado lo ve en "Mis Documentos" sin tocar esa
  // pantalla. Se usa el mismo patrón de persistencia que ya tiene HrDocument hoy
  // (uploadBase64 si Cloudinary, si no fileData directo) — no se migra a StoredFile en este
  // frente, eso quedó fuera de lo decidido para Contract específicamente.
  //
  // El PDF combinado (lista de raya completa) se genera y se devuelve en la respuesta para
  // descarga inmediata del administrador — a propósito NO se guarda como HrDocument de
  // ningún empleado individual, porque contiene los montos de TODOS los empleados de la
  // corrida (fuga de privacidad salarial si un empleado lo viera en su propio portal).
  async generateReceipts(runId: string, tenantId: string): Promise<{ receiptsGenerated: number; listaDeRayaPdf: string }> {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException('Corrida de nómina no encontrada');

    const entries = await this.entryRepo.find({ where: { payrollRunId: runId } });
    const employeeRepo = this.dataSource.getRepository('Employee');
    const employees: any[] = await employeeRepo.find({
      where: { id: In(entries.map((e) => e.employeeId)) },
    });
    const employeeById = new Map(employees.map((e) => [e.id, e]));

    const companyRows = await this.dataSource.query(`SELECT * FROM company WHERE id = $1 LIMIT 1`, [run.companyId]);
    const company = companyRows[0];
    const branchRows = await this.dataSource.query(`SELECT * FROM branch WHERE id = $1 LIMIT 1`, [run.branchId]);
    const branch = branchRows[0];

    const docRepo = this.dataSource.getRepository('HrDocument');
    let receiptsGenerated = 0;

    for (const entry of entries) {
      const emp = employeeById.get(entry.employeeId);
      if (!emp) continue;

      const pdfBase64 = await this.buildReceiptPdf(entry, run, emp, company, branch);

      let fileData: string | null = pdfBase64;
      let url = '';
      if (process.env.STORAGE_PROVIDER === 'cloudinary') {
        try {
          const folder = `estia/employees/${emp.id}/payroll`;
          const result = await this.storageService.uploadBase64(pdfBase64, folder, `recibo_${entry.id}`);
          url = result.url;
          fileData = null;
        } catch (e) {
          console.error('Error subiendo recibo a Cloudinary, se guarda en base64:', e);
        }
      }

      const savedDoc = await docRepo.save(
        docRepo.create({
          employeeId: emp.id,
          tipo: 'RECIBO_NOMINA',
          nombre: `Recibo de nómina ${run.periodStart} al ${run.periodEnd}`,
          fileData: fileData ?? undefined,
          url,
        }),
      );

      // Auditoría de producto (GoodsHabits): hallazgo real confirmado en producción — este
      // endpoint respondió 200 con receiptsGenerated:1 (y el PDF de lista de raya se generó
      // con datos correctos) pero la fila nunca quedó en hr_document. Descartado a nivel de
      // código: no existe ningún camino donde receiptsGenerated++ corra sin que el
      // docRepo.save() de arriba se complete sin lanzar (JS/await lo garantiza) — la causa
      // raíz real sigue sin identificarse (posible STORAGE_PROVIDER/entorno de producción,
      // bajo investigación aparte). Mientras tanto, esta relectura convierte el modo de
      // falla de silencioso (200 engañoso) a ruidoso (500 inmediato) — nunca más se debe
      // reportar éxito sin confirmar que la fila realmente quedó ahí.
      const verify = await docRepo.findOne({ where: { id: savedDoc.id } });
      if (!verify) {
        throw new InternalServerErrorException(
          `El recibo de nómina para el empleado ${emp.id} no se persistió en hr_document pese a que docRepo.save() no lanzó error (documentId esperado: ${savedDoc.id}, corrida ${runId}).`,
        );
      }

      receiptsGenerated++;
    }

    const listaDeRayaPdf = await this.buildListaDeRayaPdf(entries, employees, run, company, branch);

    return { receiptsGenerated, listaDeRayaPdf };
  }

  private async buildReceiptPdf(entry: PayrollEntry, run: PayrollRun, emp: any, company: any, branch: any): Promise<string> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // carta
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    let y = 740;

    // advance=false permite dibujar una segunda columna (ej. el monto) en la misma línea
    // que el texto recién dibujado, sin bajar "y" dos veces.
    const draw = (text: string, opts: { x?: number; size?: number; b?: boolean; color?: [number, number, number]; advance?: boolean } = {}) => {
      page.drawText(text, {
        x: opts.x ?? 50,
        y,
        size: opts.size ?? 10,
        font: opts.b ? bold : font,
        color: rgb(...(opts.color ?? [0, 0, 0])),
      });
      if (opts.advance !== false) y -= (opts.size ?? 10) + 6;
    };

    draw(company?.legalName || company?.tradeName || 'Empresa', { size: 14, b: true });
    draw(`Sucursal: ${branch?.name || '—'}   Período: ${run.periodStart} al ${run.periodEnd}   Tipo: ${run.periodType}`, { size: 9, color: [0.3, 0.3, 0.3] });
    y -= 10;

    draw(`${emp.nombre} ${emp.apellidos || ''}`.trim(), { size: 12, b: true });
    draw(`${emp.puesto || '—'}   IMSS: ${emp.imssNumber || 'N/D'}`, { size: 9, color: [0.3, 0.3, 0.3] });
    draw(`Días laborados: ${entry.workedDays}   Salario diario: $${Number(entry.dailySalary).toFixed(2)}`, { size: 9, color: [0.3, 0.3, 0.3] });
    y -= 10;

    const perceptions = (entry.concepts || []).filter((c: any) => c.type === 'P');
    const deductions = (entry.concepts || []).filter((c: any) => c.type === 'D');

    draw('PERCEPCIONES', { size: 10, b: true });
    for (const c of perceptions) {
      draw(`  ${c.name}`, { size: 9, x: 60, advance: false });
      draw(`$${Number(c.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, { size: 9, x: 450 });
    }
    y -= 4;
    draw('DEDUCCIONES', { size: 10, b: true });
    for (const c of deductions) {
      draw(`  ${c.name}`, { size: 9, x: 60, advance: false });
      draw(`-$${Number(c.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, { size: 9, x: 450 });
    }
    y -= 10;

    draw(`Total percepciones: $${Number(entry.totalPerceptions).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, { size: 10 });
    draw(`Total deducciones: -$${Number(entry.totalDeductions).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, { size: 10 });
    y -= 6;
    draw(`NETO A PAGAR EN EFECTIVO: $${Number(entry.netAmount).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, { size: 13, b: true });

    y -= 60;
    page.drawLine({ start: { x: 380, y: y + 20 }, end: { x: 560, y: y + 20 }, thickness: 0.75, color: rgb(0, 0, 0) });
    draw('Firma del trabajador', { x: 400, size: 8, color: [0.3, 0.3, 0.3] });

    const bytes = await pdfDoc.save();
    return Buffer.from(bytes).toString('base64');
  }

  private async buildListaDeRayaPdf(entries: PayrollEntry[], employees: any[], run: PayrollRun, company: any, branch: any): Promise<string> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const employeeById = new Map(employees.map((e) => [e.id, e]));

    let page = pdfDoc.addPage([612, 792]);
    let y = 740;
    const newPageIfNeeded = () => {
      if (y < 80) {
        page = pdfDoc.addPage([612, 792]);
        y = 740;
      }
    };

    page.drawText(company?.legalName || company?.tradeName || 'Empresa', { x: 50, y, size: 14, font: bold });
    y -= 20;
    page.drawText(`Lista de raya — Sucursal: ${branch?.name || '—'} — ${run.periodStart} al ${run.periodEnd}`, { x: 50, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
    y -= 26;

    let totalNet = 0;
    for (const entry of entries) {
      newPageIfNeeded();
      const emp = employeeById.get(entry.employeeId);
      const name = emp ? `${emp.nombre} ${emp.apellidos || ''}`.trim() : entry.employeeId;
      page.drawText(name, { x: 50, y, size: 10, font: bold });
      page.drawText(`$${Number(entry.netAmount).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, { x: 450, y, size: 10, font });
      totalNet += Number(entry.netAmount);
      y -= 18;
    }

    newPageIfNeeded();
    y -= 10;
    page.drawText(`TOTAL PAGADO: $${totalNet.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, { x: 50, y, size: 12, font: bold });

    const bytes = await pdfDoc.save();
    return Buffer.from(bytes).toString('base64');
  }
}

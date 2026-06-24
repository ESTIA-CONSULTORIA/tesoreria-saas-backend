import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { PayrollRun } from './entities/payroll-run.entity';
import { PayrollEntry } from './entities/payroll-entry.entity';
import { PayrollConceptTemplate } from './entities/payroll-concept-template.entity';
import { EmployeeIncapacity } from './entities/employee-incapacity.entity';

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
}

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { Employee } from './entities/employee.entity';
import { HrDocument } from './entities/hr-document.entity';
import { VacationRequest } from './entities/vacation-request.entity';
import { PermissionRequest } from './entities/permission-request.entity';
import { HrShift } from './entities/hr-shift.entity';
import { Attendance } from './entities/attendance.entity';
import { BiometricCredential } from './entities/biometric-credential.entity';
import { AttendanceAudit } from './entities/attendance-audit.entity';
import { Branch } from '../branches/entities/branch.entity';
import { OcrService } from '../ocr/ocr.service';
import { StorageService } from '../storage/storage.service';

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

@Injectable()
export class HrService {
  constructor(
    @InjectRepository(Employee)
    private readonly empRepo: Repository<Employee>,
    @InjectRepository(HrDocument)
    private readonly docRepo: Repository<HrDocument>,
    @InjectRepository(VacationRequest)
    private readonly vacRepo: Repository<VacationRequest>,
    @InjectRepository(PermissionRequest)
    private readonly permRepo: Repository<PermissionRequest>,
    @InjectRepository(HrShift)
    private readonly shiftRepo: Repository<HrShift>,
    @InjectRepository(Attendance)
    private readonly attendanceRepo: Repository<Attendance>,
    @InjectRepository(BiometricCredential)
    private readonly bioRepo: Repository<BiometricCredential>,
    @InjectRepository(AttendanceAudit)
    private readonly attendanceAuditRepo: Repository<AttendanceAudit>,
    @InjectRepository(Branch)
    private readonly branchRepo: Repository<Branch>,
    private readonly ocrService: OcrService,
    private readonly storageService: StorageService,
  ) {}

  // --- Employees ---

  findAllEmployees(tenantId?: string, companyId?: string): Promise<Employee[]> {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    if (companyId) where.companyId = companyId;
    return this.empRepo.find({ where, order: { nombre: 'ASC' } });
  }

  async createEmployee(data: Partial<Employee>): Promise<Employee> {
    const normalized = this.normalizeEmployeeUserId(data);
    if (normalized.userId) {
      await this.assertUserIdNotLinked(normalized.userId, normalized.tenantId);
    }
    try {
      return await this.empRepo.save(this.empRepo.create(normalized));
    } catch (error) {
      throw this.mapUserIdConflict(error);
    }
  }

  async updateEmployee(id: string, data: Partial<Employee>, tenantId?: string): Promise<Employee> {
    const emp = await this.empRepo.findOne({ where: { id } });
    if (!emp) throw new NotFoundException('Empleado no encontrado');
    if (tenantId && emp.tenantId && emp.tenantId !== tenantId) {
      throw new ForbiddenException('No tienes permiso sobre este empleado');
    }
    const normalized = this.normalizeEmployeeUserId(data);
    if (normalized.userId) {
      await this.assertUserIdNotLinked(normalized.userId, tenantId ?? emp.tenantId, id);
    }
    try {
      await this.empRepo.update(id, normalized);
    } catch (error) {
      throw this.mapUserIdConflict(error);
    }
    return this.empRepo.findOne({ where: { id } }) as Promise<Employee>;
  }

  // El selector del frontend envía '' para "Sin vincular" — se normaliza a NULL para
  // que el índice único parcial (WHERE "userId" IS NOT NULL) no trate strings vacíos
  // como un valor duplicado real.
  private normalizeEmployeeUserId<T extends Partial<Employee>>(data: T): T {
    if (data.userId === '') {
      return { ...data, userId: null as unknown as string };
    }
    return data;
  }

  // Chequeo por tenant: un userId real solo pertenece a un tenant de todas formas
  // (User.tenantId es fijo), así que scopear acá no baja la seguridad — solo evita
  // comparar contra empleados de otros tenants. excludeEmployeeId es para permitir
  // que un update conserve su propio vínculo sin chocar consigo mismo.
  private async assertUserIdNotLinked(
    userId: string,
    tenantId?: string,
    excludeEmployeeId?: string,
  ): Promise<void> {
    const where: any = { userId };
    if (tenantId) where.tenantId = tenantId;
    if (excludeEmployeeId) where.id = Not(excludeEmployeeId);
    const existing = await this.empRepo.findOne({ where });
    if (existing) {
      throw new BadRequestException('Este usuario ya está vinculado a otro empleado');
    }
  }

  // Red de seguridad contra la carrera de dos requests casi simultáneos vinculando
  // al mismo userId dos empleados distintos: el chequeo de arriba no es atómico,
  // el índice único parcial UQ_employee_userId sí lo es. Mismo patrón de mapeo de
  // 23505 que sales.service.ts (folio duplicado) — es un conflicto real que debe
  // llegar al usuario como 400, no como 500 genérico.
  private mapUserIdConflict(error: any): Error {
    if (error?.code === '23505' && error?.constraint === 'UQ_employee_userId') {
      return new BadRequestException('Este usuario ya está vinculado a otro empleado');
    }
    return error;
  }

  async removeEmployee(id: string, tenantId?: string): Promise<void> {
    const emp = await this.empRepo.findOne({ where: { id } });
    if (!emp) throw new NotFoundException('Empleado no encontrado');
    if (tenantId && emp.tenantId && emp.tenantId !== tenantId) {
      throw new ForbiddenException('No tienes permiso sobre este empleado');
    }
    await this.empRepo.delete(id);
  }

  // --- Documents ---
  //
  // Auditoría de producto (GoodsHabits, Fase 3 — Storage, Frente 2): HrDocument ya no
  // guarda fileData/url en sus propias columnas — viven en StoredFile, ownerType:
  // 'hr_document', ownerId: doc.id, role: 'file' (constante, ver
  // MigrateHrDocumentFilesToStoredFile). Todo lo que antes ramificaba por
  // STORAGE_PROVIDER === 'cloudinary' ahora pasa siempre por storageService.upload(), que ya
  // decide el proveedor internamente — un solo camino de escritura para ambos providers.

  // Adjunta a cada HrDocument su contenido resuelto (url o fileData como data-URI) en una
  // sola query batch — mantiene el mismo contrato HTTP que ya consumen HRPage.tsx y
  // EmployeeDocuments.tsx (doc.url / doc.fileData) sin un round-trip a StoredFile por
  // documento.
  private async attachContent(docs: HrDocument[]): Promise<(HrDocument & { url?: string; fileData?: string })[]> {
    if (!docs.length) return docs;
    const contentByDoc = await this.storageService.getContentByOwners(
      'hr_document',
      docs.map((d) => d.id),
      'file',
    );
    return docs.map((doc) => {
      const content = contentByDoc.get(doc.id);
      if (!content) return doc;
      if (content.url) return { ...doc, url: content.url };
      if (content.base64) {
        return { ...doc, fileData: `data:${content.mimeType || 'application/octet-stream'};base64,${content.base64}` };
      }
      return doc;
    });
  }

  async findDocsByEmployee(employeeId: string, tenantId?: string): Promise<HrDocument[]> {
    const docs = await this.docRepo.find({ where: { employeeId }, order: { uploadedAt: 'DESC' } });
    return this.attachContent(docs);
  }

  private mimeTypeFromDataUrl(value: string): string | undefined {
    return value.match(/^data:([^;]+);base64,/)?.[1];
  }

  async addDocument(employeeId: string, data: any): Promise<HrDocument> {
    // fileData/url ya no son columnas de HrDocument — se destructuran fuera para no
    // intentar guardarlas por accidente vía el spread; fileData (si viene) se sube aparte.
    const { fileData, url: _ignoredUrl, ...rest } = data;
    // Tipado explícito: docRepo.create() con un objeto `any` puro resuelve al overload de
    // array (create(entityLikeArray): T[]) en vez del de un solo registro — mismo problema
    // que ya resolvía el `as unknown as Promise<HrDocument>` de la versión anterior de este
    // método.
    const docData: Partial<HrDocument> = { ...rest, employeeId };
    const doc = await this.docRepo.save(this.docRepo.create(docData));

    if (fileData) {
      const emp = await this.empRepo.findOne({ where: { id: employeeId } });
      await this.storageService.upload({
        tenantId: emp?.tenantId ?? '',
        ownerType: 'hr_document',
        ownerId: doc.id,
        role: 'file',
        data: fileData,
        mimeType: this.mimeTypeFromDataUrl(fileData),
        folder: `estia/employees/${employeeId}/documents`,
        fileName: `${data.tipo || 'doc'}_${doc.id}`,
      });
    }

    return doc;
  }

  async removeDocument(id: string): Promise<void> {
    const file = await this.storageService.getOneByOwner('hr_document', id, 'file');
    if (file) {
      try {
        // Best-effort: si el proveedor externo (Cloudinary) falla al borrar, no se bloquea
        // el borrado del documento — mismo criterio que el try/catch que reemplaza (antes
        // envolvía la llamada a Cloudinary directo). Puede dejar una fila stored_file
        // huérfana en ese caso raro; se prefiere eso a un 500 en un borrado normal.
        await this.storageService.deleteStoredFile(file.id);
      } catch (e) {
        console.error('Error eliminando archivo de documento de RH:', e);
      }
    }
    await this.docRepo.delete(id);
  }

  async getEmployeePhotos(employeeIds: string[]): Promise<Record<string, string>> {
    if (!employeeIds.length) return {};
    const docs = await this.docRepo.find({
      where: { employeeId: In(employeeIds), tipo: 'FOTO' },
      order: { uploadedAt: 'DESC' },
    });
    const contentByDoc = await this.storageService.getContentByOwners(
      'hr_document',
      docs.map((d) => d.id),
      'file',
    );
    const result: Record<string, string> = {};
    for (const doc of docs) {
      if (result[doc.employeeId]) continue;
      const content = contentByDoc.get(doc.id);
      if (!content) continue;
      // Antes solo fileData (base64) producía avatar — una FOTO subida vía Cloudinary nunca
      // se mostraba. content.url funciona igual de bien como src de <img>, así que se
      // atiende también ese caso en vez de mantener el hueco.
      if (content.base64) {
        result[doc.employeeId] = `data:${content.mimeType || 'image/jpeg'};base64,${content.base64}`;
      } else if (content.url) {
        result[doc.employeeId] = content.url;
      }
    }
    return result;
  }

  async getBirthdaysThisMonth(tenantId: string): Promise<Partial<Employee>[]> {
    const currentMonth = new Date().getMonth() + 1;
    const employees = await this.empRepo.find({
      where: { tenantId, status: 'ACTIVO' },
    });
    return employees
      .filter((e) => {
        if (!e.fechaNacimiento) return false;
        const d = new Date(e.fechaNacimiento);
        return d.getUTCMonth() + 1 === currentMonth;
      })
      .sort((a, b) => {
        const da = new Date(a.fechaNacimiento!).getUTCDate();
        const db = new Date(b.fechaNacimiento!).getUTCDate();
        return da - db;
      })
      .map((e) => ({
        id: e.id,
        nombre: e.nombre,
        apellidos: e.apellidos,
        fechaNacimiento: e.fechaNacimiento,
        puesto: e.puesto,
        departamento: e.departamento,
      }));
  }

  async ocrDocument(
    employeeId: string,
    fileData: string,
    tipo: string,
  ): Promise<{ documentId: string; extractedFields: Record<string, string> }> {
    const emp = await this.empRepo.findOne({ where: { id: employeeId } });
    if (!emp) throw new NotFoundException('Empleado no encontrado');

    const matches = fileData.match(/^data:([^;]+);base64,(.+)$/s);
    if (!matches) throw new BadRequestException('Formato de archivo inválido');
    const mimetype = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');

    const rawText = await this.ocrService.extractTextFromBuffer(buffer, mimetype);
    console.log('=== OCR RAW TEXT START ===');
    console.log(rawText);
    console.log('=== OCR RAW TEXT END ===');
    const extractedFields = this.ocrService.extractHrFields(rawText, tipo);

    const doc = await this.docRepo.save(
      this.docRepo.create({
        employeeId,
        tipo,
        nombre: tipo,
        ocrExtracted: extractedFields,
        ocrConfirmed: false,
      }),
    );

    await this.storageService.upload({
      tenantId: emp.tenantId ?? '',
      ownerType: 'hr_document',
      ownerId: doc.id,
      role: 'file',
      data: fileData,
      mimeType: mimetype,
      folder: `estia/employees/${employeeId}/documents`,
      fileName: `${tipo}_${doc.id}`,
    });

    return { documentId: doc.id, extractedFields };
  }

  async confirmOcr(
    employeeId: string,
    documentId: string,
    fields: Record<string, string>,
  ): Promise<Employee> {
    await this.docRepo.update(documentId, { ocrConfirmed: true });

    const allowed: (keyof Employee)[] = [
      'nombre', 'apellidos', 'curp', 'rfc', 'nss', 'numeroIne',
      'domicilio', 'colonia', 'ciudad', 'estado', 'codigoPostal',
      'banco', 'clabe', 'fechaNacimiento', 'genero',
    ];

    const update: Partial<Employee> = {};
    for (const key of allowed) {
      if (fields[key] !== undefined && fields[key] !== '') {
        (update as any)[key] = fields[key];
      }
    }

    if (Object.keys(update).length > 0) {
      await this.empRepo.update(employeeId, update);
    }

    return this.empRepo.findOne({ where: { id: employeeId } }) as Promise<Employee>;
  }

  // --- Portal: get employee by userId ---

  async findEmployeeByUserId(userId: string): Promise<Employee | null> {
    return this.empRepo.findOne({ where: { userId } });
  }

  async getPortalProfile(userId: string): Promise<any | null> {
    const emp = await this.empRepo.findOne({ where: { userId } });
    if (!emp) return null;
    const result: any = { ...emp };
    if (emp.shiftId) {
      const shift = await this.shiftRepo.findOne({ where: { id: emp.shiftId } });
      result.shiftName = shift?.name ?? null;
    }
    return result;
  }

  async getRecentAttendanceForUser(userId: string): Promise<Attendance[]> {
    const emp = await this.empRepo.findOne({ where: { userId } });
    if (!emp) return [];
    return this.attendanceRepo.find({
      where: { employeeId: emp.id },
      order: { date: 'DESC' },
      take: 5,
    });
  }

  // --- Shifts ---

  findAllShifts(tenantId: string): Promise<HrShift[]> {
    return this.shiftRepo.find({ where: { tenantId, isActive: true }, order: { name: 'ASC' } });
  }

  createShift(data: Partial<HrShift>): Promise<HrShift> {
    return this.shiftRepo.save(this.shiftRepo.create(data));
  }

  async updateShift(id: string, data: Partial<HrShift>): Promise<HrShift> {
    await this.shiftRepo.update(id, data);
    return this.shiftRepo.findOne({ where: { id } }) as Promise<HrShift>;
  }

  async deleteShift(id: string): Promise<void> {
    await this.shiftRepo.update(id, { isActive: false });
  }

  // --- Vacation Requests ---

  createVacationRequest(data: Partial<VacationRequest>): Promise<VacationRequest> {
    if (data.startDate && data.endDate) {
      const start = new Date(data.startDate);
      const end = new Date(data.endDate);
      const diff = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1;
      data.daysRequested = Math.max(0, diff);
    }
    return this.vacRepo.save(this.vacRepo.create(data));
  }

  findVacationsByEmployee(employeeId: string): Promise<VacationRequest[]> {
    return this.vacRepo.find({ where: { employeeId }, order: { createdAt: 'DESC' } });
  }

  findPendingRequests(tenantId: string): Promise<{ vacaciones: VacationRequest[]; permisos: PermissionRequest[] }> {
    return Promise.all([
      this.vacRepo.find({ where: { tenantId, status: 'PENDIENTE' }, order: { createdAt: 'ASC' } }),
      this.permRepo.find({ where: { tenantId, status: 'PENDIENTE' }, order: { createdAt: 'ASC' } }),
    ]).then(([vacaciones, permisos]) => ({ vacaciones, permisos }));
  }

  async approveVacation(id: string, approvedBy: string, responseNote?: string): Promise<VacationRequest> {
    const vacation = await this.vacRepo.findOne({ where: { id } });
    if (!vacation) throw new NotFoundException('Solicitud de vacaciones no encontrada');
    await this.vacRepo.update(id, { status: 'APROBADA', approvedBy, approvedAt: new Date(), responseNote: responseNote || '' });

    const start = new Date(vacation.startDate);
    const end = new Date(vacation.endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const existing = await this.attendanceRepo.findOne({
        where: { employeeId: vacation.employeeId, date: dateStr as any },
      });
      if (!existing) {
        await this.attendanceRepo.save({
          employeeId: vacation.employeeId,
          tenantId: vacation.tenantId,
          date: dateStr,
          status: 'JUSTIFICADO',
          method: 'WEB',
          notes: 'Vacaciones aprobadas',
        });
      }
    }

    return this.vacRepo.findOne({ where: { id } }) as Promise<VacationRequest>;
  }

  async rejectVacation(id: string, approvedBy: string, responseNote: string): Promise<VacationRequest> {
    await this.vacRepo.update(id, { status: 'RECHAZADA', approvedBy, responseNote });
    return this.vacRepo.findOne({ where: { id } }) as Promise<VacationRequest>;
  }

  // --- Permission Requests ---

  createPermissionRequest(data: Partial<PermissionRequest>): Promise<PermissionRequest> {
    return this.permRepo.save(this.permRepo.create(data));
  }

  findPermissionsByEmployee(employeeId: string): Promise<PermissionRequest[]> {
    return this.permRepo.find({ where: { employeeId }, order: { createdAt: 'DESC' } });
  }

  async approvePermission(id: string, approvedBy: string, responseNote?: string): Promise<PermissionRequest> {
    const permission = await this.permRepo.findOne({ where: { id } });
    if (!permission) throw new NotFoundException('Solicitud de permiso no encontrada');
    await this.permRepo.update(id, { status: 'APROBADA', approvedBy, responseNote: responseNote || '' });

    const dateStr = new Date(permission.date).toISOString().split('T')[0];
    const existing = await this.attendanceRepo.findOne({
      where: { employeeId: permission.employeeId, date: dateStr as any },
    });
    if (!existing) {
      await this.attendanceRepo.save({
        employeeId: permission.employeeId,
        tenantId: permission.tenantId,
        date: dateStr,
        status: 'JUSTIFICADO',
        method: 'WEB',
        notes: `Permiso aprobado: ${permission.type}`,
      });
    }

    return this.permRepo.findOne({ where: { id } }) as Promise<PermissionRequest>;
  }

  async rejectPermission(id: string, approvedBy: string, responseNote: string): Promise<PermissionRequest> {
    await this.permRepo.update(id, { status: 'RECHAZADA', approvedBy, responseNote });
    return this.permRepo.findOne({ where: { id } }) as Promise<PermissionRequest>;
  }

  // --- Attendance ---

  private getShiftStatus(now: Date, shift: HrShift): string {
    const [startH, startM] = shift.startTime.split(':').map(Number);
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const startMins = startH * 60 + startM;
    const tolerance = shift.toleranceMinutes ?? 15;
    if (nowMins < startMins - 30) return 'ANTICIPADA';
    if (nowMins <= startMins + tolerance) return 'PRESENTE';
    return 'TARDANZA';
  }

  async checkIn(
    employeeId: string,
    tenantId: string,
    branchId?: string,
    method?: string,
    lat?: number,
    lng?: number,
  ): Promise<Attendance> {
    if (!employeeId) throw new BadRequestException('ID de empleado requerido');

    // Anti-double check
    const today = new Date().toISOString().slice(0, 10);
    const existing = await this.attendanceRepo.findOne({
      where: { employeeId, date: today as any },
    });
    if (existing) {
      if (!existing.checkOut) return existing;
      throw new BadRequestException('Ya tienes una jornada completa registrada hoy.');
    }

    // Geofencing — validate distance only when branch has coordinates AND employee sent GPS
    let verificationMethod = method || 'WEB_NO_GPS';
    if (branchId && lat !== undefined && lng !== undefined) {
      const branch = await this.branchRepo.findOne({ where: { id: branchId } });
      if (branch && branch.lat != null && branch.lng != null) {
        const distance = haversineMeters(Number(branch.lat), Number(branch.lng), lat, lng);
        if (distance > 10) {
          throw new BadRequestException(
            `Estás a ${Math.round(distance)}m de la sucursal. El máximo permitido es 10 metros.`,
          );
        }
      }
      verificationMethod = 'WEB_GPS';
    }

    // Server timestamp — never from request body
    const serverNow = new Date();

    // Time-window status from employee's assigned shift
    let attendanceStatus = 'PRESENTE';
    const employee = await this.empRepo.findOne({ where: { id: employeeId } });
    if (employee?.shiftId) {
      const shift = await this.shiftRepo.findOne({ where: { id: employee.shiftId } });
      if (shift) attendanceStatus = this.getShiftStatus(serverNow, shift);
    }

    const rec = this.attendanceRepo.create({
      employeeId,
      tenantId,
      branchId,
      method: verificationMethod,
      date: today as any,
      checkIn: serverNow,
      status: attendanceStatus,
      lat,
      lng,
    });
    return this.attendanceRepo.save(rec);
  }

  async checkOut(employeeId: string): Promise<Attendance | null> {
    const today = new Date().toISOString().slice(0, 10);
    const rec = await this.attendanceRepo.findOne({
      where: { employeeId, date: today as any },
    });
    if (!rec) throw new BadRequestException('No tienes una entrada registrada hoy.');
    if (rec.checkOut) throw new BadRequestException('Tu salida ya fue registrada hoy.');
    await this.attendanceRepo.update(rec.id, { checkOut: new Date() });
    return this.attendanceRepo.findOne({ where: { id: rec.id } });
  }

  async updateAttendance(
    id: string,
    data: Partial<{
      status: string;
      incidenceType: string;
      overtimeHours: number;
      incidenceNote: string;
      notes: string;
    }>,
  ) {
    await this.attendanceRepo.update(id, data);
    return this.attendanceRepo.findOne({ where: { id } });
  }

  async upsertAttendance(data: {
    employeeId: string;
    date: string;
    status: string;
    incidenceType?: string;
    overtimeHours?: number;
    incidenceNote?: string;
    tenantId?: string;
    branchId?: string;
    changeReason?: string;
    changedBy?: string;
    approvedBy?: string;
  }) {
    const existing = await this.attendanceRepo.findOne({
      where: { employeeId: data.employeeId, date: data.date as any },
    });

    const previousStatus = existing?.status || null;
    const previousIncidenceType = existing?.incidenceType || null;

    let result: Attendance;
    if (existing) {
      await this.attendanceRepo.update(existing.id, {
        status: data.status,
        incidenceType: data.incidenceType,
        overtimeHours: data.overtimeHours,
        incidenceNote: data.incidenceNote,
      });
      result = (await this.attendanceRepo.findOne({ where: { id: existing.id } }))!;
    } else {
      result = await this.attendanceRepo.save({
        employeeId: data.employeeId,
        date: data.date,
        status: data.status,
        incidenceType: data.incidenceType,
        overtimeHours: data.overtimeHours,
        incidenceNote: data.incidenceNote,
        tenantId: data.tenantId,
        branchId: data.branchId,
        method: 'MANUAL',
      });
    }

    if (data.changedBy && (previousStatus !== data.status || previousIncidenceType !== (data.incidenceType ?? null))) {
      const auditEntry = this.attendanceAuditRepo.create({
        attendanceId: result.id,
        employeeId: data.employeeId,
        tenantId: data.tenantId || '',
        date: data.date,
        previousStatus: previousStatus ?? undefined,
        previousIncidenceType: previousIncidenceType ?? undefined,
        newStatus: data.status,
        newIncidenceType: data.incidenceType,
        changeReason: data.changeReason,
        changedBy: data.changedBy,
        approvedBy: data.approvedBy,
        approvedAt: data.approvedBy ? new Date() : undefined,
        reverted: false,
      });
      await this.attendanceAuditRepo.save(auditEntry);
    }

    return result;
  }

  async getAttendanceAudit(employeeId: string, tenantId: string) {
    return this.attendanceAuditRepo.find({
      where: { employeeId, tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async revertAttendanceChange(auditId: string, revertedBy: string) {
    const audit = await this.attendanceAuditRepo.findOne({ where: { id: auditId } });
    if (!audit || audit.reverted) throw new NotFoundException('Registro no encontrado o ya revertido');

    await this.attendanceRepo.update(audit.attendanceId, {
      status: audit.previousStatus || 'PRESENTE',
      incidenceType: audit.previousIncidenceType || undefined,
    });

    await this.attendanceAuditRepo.update(auditId, {
      reverted: true,
      revertedBy,
      revertedAt: new Date(),
    });

    return { reverted: true, auditId };
  }

  async createManualAttendance(data: {
    employeeId: string;
    date: string;
    checkIn?: string;
    checkOut?: string;
    tenantId?: string;
  }): Promise<Attendance | null> {
    const { employeeId, date, checkIn, checkOut, tenantId } = data;
    if (!employeeId || !date) throw new BadRequestException('employeeId y date son requeridos');

    const existing = await this.attendanceRepo.findOne({ where: { employeeId, date: date as any } });
    if (existing) {
      const updates: any = {};
      if (checkIn) updates.checkIn = new Date(`${date}T${checkIn}:00`);
      if (checkOut) updates.checkOut = new Date(`${date}T${checkOut}:00`);
      await this.attendanceRepo.update(existing.id, updates);
      return this.attendanceRepo.findOne({ where: { id: existing.id } });
    }

    const rec = this.attendanceRepo.create({
      employeeId,
      tenantId,
      date: date as any,
      checkIn: checkIn ? new Date(`${date}T${checkIn}:00`) : new Date(`${date}T08:00:00`),
      checkOut: checkOut ? new Date(`${date}T${checkOut}:00`) : undefined,
      method: 'MANUAL',
      status: 'PRESENTE',
    });
    return this.attendanceRepo.save(rec);
  }

  async findTodayAttendanceByEmployee(employeeId: string): Promise<Attendance | null> {
    const today = new Date().toISOString().slice(0, 10);
    return this.attendanceRepo.findOne({ where: { employeeId, date: today as any } });
  }

  // Portal-specific: resolve employee by userId, then check in/out
  async portalCheckIn(userId: string, lat?: number, lng?: number, method?: string): Promise<Attendance> {
    const employee = await this.empRepo.findOne({ where: { userId } });
    if (!employee) throw new NotFoundException('No tienes un perfil de empleado vinculado a tu usuario.');
    return this.checkIn(employee.id, employee.tenantId, employee.branchId, method, lat, lng);
  }

  async portalCheckOut(userId: string): Promise<Attendance | null> {
    const employee = await this.empRepo.findOne({ where: { userId } });
    if (!employee) throw new NotFoundException('No tienes un perfil de empleado vinculado a tu usuario.');
    return this.checkOut(employee.id);
  }

  findAttendanceToday(branchId: string): Promise<Attendance[]> {
    const today = new Date().toISOString().slice(0, 10);
    return this.attendanceRepo.find({ where: { branchId, date: today as any } });
  }

  findAttendanceByEmployee(employeeId: string, startDate?: Date, endDate?: Date): Promise<Attendance[]> {
    const q = this.attendanceRepo.createQueryBuilder('a').where('a.employeeId = :employeeId', { employeeId });
    if (startDate) q.andWhere('a.date >= :startDate', { startDate });
    if (endDate) q.andWhere('a.date <= :endDate', { endDate });
    return q.orderBy('a.date', 'DESC').getMany();
  }

  // --- Biometrics ---

  async registerFace(employeeId: string, tenantId: string, faceDescriptor: number[]): Promise<BiometricCredential> {
    const existing = await this.bioRepo.findOne({ where: { employeeId, type: 'FACE' } });
    const data = { employeeId, tenantId, type: 'FACE', faceDescriptor: JSON.stringify(faceDescriptor), isActive: true };
    if (existing) {
      await this.bioRepo.update(existing.id, data);
      return this.bioRepo.findOne({ where: { id: existing.id } }) as Promise<BiometricCredential>;
    }
    return this.bioRepo.save(this.bioRepo.create(data));
  }

  async verifyFace(faceDescriptor: number[], tenantId: string): Promise<{ employeeId: string; distance: number } | null> {
    const credentials = await this.bioRepo.find({ where: { tenantId, type: 'FACE', isActive: true } });
    let best: { employeeId: string; distance: number } | null = null;
    for (const cred of credentials) {
      if (!cred.faceDescriptor) continue;
      const stored: number[] = JSON.parse(cred.faceDescriptor);
      const dist = Math.sqrt(faceDescriptor.reduce((s, v, i) => s + Math.pow(v - (stored[i] || 0), 2), 0));
      if (dist < 0.6 && (!best || dist < best.distance)) {
        best = { employeeId: cred.employeeId, distance: dist };
      }
    }
    return best;
  }

  findBiometricsByEmployee(employeeId: string): Promise<BiometricCredential[]> {
    return this.bioRepo.find({ where: { employeeId } });
  }

  findBiometricsByTenant(tenantId: string): Promise<BiometricCredential[]> {
    return this.bioRepo.find({ where: { tenantId, isActive: true } });
  }
}

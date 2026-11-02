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
import { Company } from '../companies/entities/company.entity';
import { OcrService } from '../ocr/ocr.service';
import { StorageService } from '../storage/storage.service';
import { FiltrosSolicitudes, parseFiltrosSolicitudes } from './pending-requests.query';

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

  // --- Aislamiento por tenant ---
  // tenantId llega SIEMPRE del token (el controlador usa tenantDeSesion / tenantParaListar / tenantParaEscribir);
  // undefined solo ocurre con SOPORTE en operaciones por id. Un recurso de otro tenant responde 404 igual que uno inexistente.
  private async empleadoDe(employeeId: string, tenantId?: string): Promise<Employee> {
    const emp = employeeId
      ? await this.empRepo.findOne({ where: tenantId ? { id: employeeId, tenantId } : { id: employeeId } })
      : null;
    if (!emp) throw new NotFoundException('Empleado no encontrado');
    return emp;
  }

  // Empresa y sucursal (que pueden venir de cabeceras / body, controlados por el cliente) deben ser del tenant.
  private async empresaDelTenant(companyId: string, tenantId: string): Promise<boolean> {
    return !!(await this.empRepo.manager.getRepository(Company).findOne({ where: { id: companyId, tenantId } as any, select: ['id'] }));
  }

  private async sucursalDelTenant(branchId: string, tenantId: string): Promise<boolean> {
    const n = await this.branchRepo
      .createQueryBuilder('b')
      .innerJoin(Company, 'c', 'c.id::text = b."companyId"::text')
      .where('b.id::text = :branchId', { branchId })
      .andWhere('c."tenantId"::text = :tenantId', { tenantId })
      .getCount();
    return n > 0;
  }

  private async validarUbicacion(tenantId: string, d: { companyId?: string; branchId?: string; shiftId?: string }) {
    if (d.companyId && !(await this.empresaDelTenant(d.companyId, tenantId))) throw new NotFoundException('Empresa no encontrada');
    if (d.branchId && !(await this.sucursalDelTenant(d.branchId, tenantId))) throw new NotFoundException('Sucursal no encontrada');
    if (d.shiftId && !(await this.shiftRepo.findOne({ where: { id: d.shiftId, tenantId } }))) throw new NotFoundException('Turno no encontrado');
  }

  // --- Employees ---

  async findAllEmployees(tenantId?: string, companyId?: string): Promise<Employee[]> {
    if (!tenantId) return []; // sin tenant (SOPORTE sin ?tenantId=) nunca se listan todos los tenants
    const where: any = { tenantId };
    if (companyId) {
      if (!(await this.empresaDelTenant(companyId, tenantId))) return [];
      where.companyId = companyId;
    }
    return this.empRepo.find({ where, order: { nombre: 'ASC' } });
  }

  async createEmployee(data: Partial<Employee>): Promise<Employee> {
    if (!data.tenantId) throw new BadRequestException('Falta el negocio del empleado');
    delete (data as any).id; // con id en el body save() actualizaría (pisaría) al empleado de otro tenant
    await this.validarUbicacion(data.tenantId, data);
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
    const emp = await this.empleadoDe(id, tenantId);
    delete (data as any).id;
    delete (data as any).tenantId; // el negocio de un empleado no se cambia
    await this.validarUbicacion(emp.tenantId, data);
    const normalized = this.normalizeEmployeeUserId(data);
    if (normalized.userId) {
      await this.assertUserIdNotLinked(normalized.userId, emp.tenantId, id);
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
    await this.empleadoDe(id, tenantId);
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
    await this.empleadoDe(employeeId, tenantId);
    const docs = await this.docRepo.find({ where: { employeeId }, order: { uploadedAt: 'DESC' } });
    return this.attachContent(docs);
  }

  private mimeTypeFromDataUrl(value: string): string | undefined {
    return value.match(/^data:([^;]+);base64,/)?.[1];
  }

  async addDocument(employeeId: string, data: any, tenantId?: string): Promise<HrDocument> {
    const empDoc = await this.empleadoDe(employeeId, tenantId);
    // fileData/url ya no son columnas de HrDocument — se destructuran fuera para no
    // intentar guardarlas por accidente vía el spread; fileData (si viene) se sube aparte.
    const { fileData, url: _ignoredUrl, id: _ignoredId, ...rest } = data;
    // Tipado explícito: docRepo.create() con un objeto `any` puro resuelve al overload de
    // array (create(entityLikeArray): T[]) en vez del de un solo registro — mismo problema
    // que ya resolvía el `as unknown as Promise<HrDocument>` de la versión anterior de este
    // método.
    const docData: Partial<HrDocument> = { ...rest, employeeId };
    const doc = await this.docRepo.save(this.docRepo.create(docData));

    if (fileData) {
      await this.storageService.upload({
        tenantId: empDoc.tenantId ?? '',
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

  async removeDocument(id: string, tenantId?: string): Promise<void> {
    const documento = await this.docRepo.findOne({ where: { id } });
    if (!documento) throw new NotFoundException('Documento no encontrado');
    await this.empleadoDe(documento.employeeId, tenantId);
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

  async getEmployeePhotos(employeeIds: string[], tenantId?: string): Promise<Record<string, string>> {
    if (!tenantId || !employeeIds.length) return {}; // las fotos son datos personales: solo de empleados del tenant
    employeeIds = (await this.empRepo.find({ where: { id: In(employeeIds), tenantId }, select: ['id'] })).map((e) => e.id);
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

  async getBirthdaysThisMonth(tenantId?: string): Promise<Partial<Employee>[]> {
    if (!tenantId) return [];
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
    tenantId?: string,
  ): Promise<{ documentId: string; extractedFields: Record<string, string> }> {
    const emp = await this.empleadoDe(employeeId, tenantId);

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
    tenantId?: string,
  ): Promise<Employee> {
    await this.empleadoDe(employeeId, tenantId);
    // El documento debe ser de ese empleado: sin esto se confirmaba el OCR de cualquier documento por id
    if (!(await this.docRepo.findOne({ where: { id: documentId, employeeId } }))) throw new NotFoundException('Documento no encontrado');
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

  async findAllShifts(tenantId?: string): Promise<HrShift[]> {
    if (!tenantId) return [];
    return this.shiftRepo.find({ where: { tenantId, isActive: true }, order: { name: 'ASC' } });
  }

  async createShift(data: Partial<HrShift>): Promise<HrShift> {
    if (!data.tenantId) throw new BadRequestException('Falta el negocio del turno');
    delete (data as any).id;
    if (data.branchId) await this.validarUbicacion(data.tenantId, { branchId: data.branchId });
    return this.shiftRepo.save(this.shiftRepo.create(data));
  }

  private async turnoDe(id: string, tenantId?: string): Promise<HrShift> {
    const shift = await this.shiftRepo.findOne({ where: tenantId ? { id, tenantId } : { id } });
    if (!shift) throw new NotFoundException('Turno no encontrado');
    return shift;
  }

  async updateShift(id: string, data: Partial<HrShift>, tenantId?: string): Promise<HrShift> {
    const shift = await this.turnoDe(id, tenantId);
    delete (data as any).id;
    delete (data as any).tenantId;
    if (data.branchId) await this.validarUbicacion(shift.tenantId, { branchId: data.branchId });
    await this.shiftRepo.update(id, data);
    return this.shiftRepo.findOne({ where: { id } }) as Promise<HrShift>;
  }

  async deleteShift(id: string, tenantId?: string): Promise<void> {
    await this.turnoDe(id, tenantId);
    await this.shiftRepo.update(id, { isActive: false });
  }

  // --- Vacation Requests ---

  async createVacationRequest(data: Partial<VacationRequest>, tenantId?: string): Promise<VacationRequest> {
    const emp = await this.empleadoDe(data.employeeId as string, tenantId);
    data.tenantId = emp.tenantId; // el negocio sale del empleado, nunca del body
    for (const k of ['id', 'status', 'approvedBy', 'approvedAt', 'responseNote'] as const) delete (data as any)[k];
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

  // Solicitudes de vacaciones y permisos para la pantalla de RH. tenantId viene SIEMPRE del token (el controlador lo
  // resuelve con tenantDeSesion; undefined = SOPORTE). Cada lista se pagina por separado con el mismo page/limit y
  // trae nombre y puesto del empleado (antes solo el id). Orden: empleado y luego fecha, para que las de una misma
  // persona queden contiguas y la pantalla pueda agruparlas.
  async findPendingRequests(tenantId: string | undefined, filtros: FiltrosSolicitudes = parseFiltrosSolicitudes()) {
    const { estado, desde, hasta, employeeId, page, limit } = filtros;
    if (!tenantId) {
      // sin tenant (SOPORTE sin ?tenantId=) nunca se listan todos los tenants
      return { vacaciones: [], permisos: [], totalVacaciones: 0, totalPermisos: 0, total: 0, page, limit };
    }
    const base = (alias: string, repo: Repository<any>) => {
      const qb = repo.createQueryBuilder(alias);
      qb.andWhere(`${alias}.tenantId = :tenantId`, { tenantId });
      if (estado) qb.andWhere(`${alias}.status = :estado`, { estado });
      if (employeeId) qb.andWhere(`${alias}.employeeId = :employeeId`, { employeeId });
      return qb;
    };

    const vacQb = base('v', this.vacRepo);
    // Vacaciones: cuenta si su rango se traslapa con [desde, hasta].
    if (desde) vacQb.andWhere('v.endDate >= :desde', { desde });
    if (hasta) vacQb.andWhere('v.startDate <= :hasta', { hasta });
    vacQb.orderBy('v.employeeId', 'ASC').addOrderBy('v.startDate', 'ASC').addOrderBy('v.id', 'ASC');

    const permQb = base('p', this.permRepo);
    if (desde) permQb.andWhere('p.date >= :desde', { desde });
    if (hasta) permQb.andWhere('p.date <= :hasta', { hasta });
    permQb.orderBy('p.employeeId', 'ASC').addOrderBy('p.date', 'ASC').addOrderBy('p.id', 'ASC');

    const skip = (page - 1) * limit;
    const [[vacaciones, totalVacaciones], [permisos, totalPermisos]] = await Promise.all([
      vacQb.skip(skip).take(limit).getManyAndCount(),
      permQb.skip(skip).take(limit).getManyAndCount(),
    ]);

    const ids = [...new Set([...vacaciones, ...permisos].map((r) => r.employeeId).filter(Boolean))];
    const empleados = ids.length
      ? await this.empRepo.find({ where: { id: In(ids), ...(tenantId ? { tenantId } : {}) } })
      : [];
    const porId = new Map(empleados.map((e) => [e.id, e]));
    const conEmpleado = <T extends { employeeId: string }>(r: T) => {
      const e = porId.get(r.employeeId);
      return {
        ...r,
        employeeNombre: e ? [e.nombre, e.apellidos].filter(Boolean).join(' ').trim() : null,
        employeePuesto: e?.puesto ?? null,
      };
    };

    return {
      vacaciones: vacaciones.map(conEmpleado),
      permisos: permisos.map(conEmpleado),
      totalVacaciones,
      totalPermisos,
      total: totalVacaciones + totalPermisos,
      page,
      limit,
    };
  }

  async approveVacation(id: string, approvedBy: string, responseNote?: string, tenantId?: string): Promise<VacationRequest> {
    const vacation = await this.vacRepo.findOne({ where: { id } });
    if (!vacation) throw new NotFoundException('Solicitud de vacaciones no encontrada');
    const empVac = await this.empleadoDe(vacation.employeeId, tenantId);
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
          tenantId: empVac.tenantId,
          date: dateStr,
          status: 'JUSTIFICADO',
          method: 'WEB',
          notes: 'Vacaciones aprobadas',
        });
      }
    }

    return this.vacRepo.findOne({ where: { id } }) as Promise<VacationRequest>;
  }

  async rejectVacation(id: string, approvedBy: string, responseNote: string, tenantId?: string): Promise<VacationRequest> {
    const vacation = await this.vacRepo.findOne({ where: { id } });
    if (!vacation) throw new NotFoundException('Solicitud de vacaciones no encontrada');
    await this.empleadoDe(vacation.employeeId, tenantId);
    await this.vacRepo.update(id, { status: 'RECHAZADA', approvedBy, responseNote });
    return this.vacRepo.findOne({ where: { id } }) as Promise<VacationRequest>;
  }

  // --- Permission Requests ---

  async createPermissionRequest(data: Partial<PermissionRequest>, tenantId?: string): Promise<PermissionRequest> {
    const emp = await this.empleadoDe(data.employeeId as string, tenantId);
    data.tenantId = emp.tenantId;
    for (const k of ['id', 'status', 'approvedBy', 'approvedAt', 'responseNote'] as const) delete (data as any)[k];
    return this.permRepo.save(this.permRepo.create(data));
  }

  findPermissionsByEmployee(employeeId: string): Promise<PermissionRequest[]> {
    return this.permRepo.find({ where: { employeeId }, order: { createdAt: 'DESC' } });
  }

  async approvePermission(id: string, approvedBy: string, responseNote?: string, tenantId?: string): Promise<PermissionRequest> {
    const permission = await this.permRepo.findOne({ where: { id } });
    if (!permission) throw new NotFoundException('Solicitud de permiso no encontrada');
    const empPerm = await this.empleadoDe(permission.employeeId, tenantId);
    await this.permRepo.update(id, { status: 'APROBADA', approvedBy, responseNote: responseNote || '' });

    const dateStr = new Date(permission.date).toISOString().split('T')[0];
    const existing = await this.attendanceRepo.findOne({
      where: { employeeId: permission.employeeId, date: dateStr as any },
    });
    if (!existing) {
      await this.attendanceRepo.save({
        employeeId: permission.employeeId,
        tenantId: empPerm.tenantId,
        date: dateStr,
        status: 'JUSTIFICADO',
        method: 'WEB',
        notes: `Permiso aprobado: ${permission.type}`,
      });
    }

    return this.permRepo.findOne({ where: { id } }) as Promise<PermissionRequest>;
  }

  async rejectPermission(id: string, approvedBy: string, responseNote: string, tenantId?: string): Promise<PermissionRequest> {
    const permission = await this.permRepo.findOne({ where: { id } });
    if (!permission) throw new NotFoundException('Solicitud de permiso no encontrada');
    await this.empleadoDe(permission.employeeId, tenantId);
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
    // El empleado debe ser del tenant del token; el registro se guarda con el tenant del empleado y la sucursal debe ser suya
    const employee = await this.empleadoDe(employeeId, tenantId);
    tenantId = employee.tenantId;
    if (branchId) await this.validarUbicacion(tenantId, { branchId });

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

  async checkOut(employeeId: string, tenantId?: string): Promise<Attendance | null> {
    await this.empleadoDe(employeeId, tenantId);
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
    tenantId?: string,
  ) {
    const att = await this.attendanceRepo.findOne({ where: { id } });
    if (!att) throw new NotFoundException('Asistencia no encontrada');
    await this.empleadoDe(att.employeeId, tenantId);
    // Solo estos campos: el body no puede reasignar empleado, tenant ni fecha del registro
    const permitido: any = {};
    for (const k of ['status', 'incidenceType', 'overtimeHours', 'incidenceNote', 'notes'] as const) {
      if ((data as any)[k] !== undefined) permitido[k] = (data as any)[k];
    }
    await this.attendanceRepo.update(id, permitido);
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
  }, tenantId?: string) {
    const emp = await this.empleadoDe(data.employeeId, tenantId);
    data.tenantId = emp.tenantId; // el negocio sale del empleado, nunca de una cabecera
    if (data.branchId) await this.validarUbicacion(emp.tenantId, { branchId: data.branchId });
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

  async getAttendanceAudit(employeeId: string, tenantId?: string) {
    await this.empleadoDe(employeeId, tenantId);
    return this.attendanceAuditRepo.find({
      where: { employeeId },
      order: { createdAt: 'DESC' },
    });
  }

  async revertAttendanceChange(auditId: string, revertedBy: string, tenantId?: string) {
    const audit = await this.attendanceAuditRepo.findOne({ where: { id: auditId } });
    if (!audit || audit.reverted) throw new NotFoundException('Registro no encontrado o ya revertido');
    await this.empleadoDe(audit.employeeId, tenantId);

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
    const { employeeId, date, checkIn, checkOut } = data;
    if (!employeeId || !date) throw new BadRequestException('employeeId y date son requeridos');
    const tenantId = (await this.empleadoDe(employeeId, data.tenantId)).tenantId;

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
    return this.checkOut(employee.id, employee.tenantId);
  }

  // Antes, sin sucursal, el where quedaba { branchId: undefined } y TypeORM lo ignoraba: asistencia de TODOS los tenants.
  async findAttendanceToday(branchId?: string, tenantId?: string): Promise<Attendance[]> {
    if (!tenantId) return [];
    const today = new Date().toISOString().slice(0, 10);
    const qb = this.attendanceRepo
      .createQueryBuilder('a')
      .innerJoin(Employee, 'e', 'e.id::text = a."employeeId"::text')
      .where('e."tenantId"::text = :tenantId', { tenantId })
      .andWhere('a.date = :today', { today });
    if (branchId) qb.andWhere('a."branchId"::text = :branchId', { branchId });
    return qb.getMany();
  }

  async findAttendanceByEmployee(employeeId: string, startDate?: Date, endDate?: Date, tenantId?: string): Promise<Attendance[]> {
    await this.empleadoDe(employeeId, tenantId);
    const q = this.attendanceRepo.createQueryBuilder('a').where('a.employeeId = :employeeId', { employeeId });
    if (startDate) q.andWhere('a.date >= :startDate', { startDate });
    if (endDate) q.andWhere('a.date <= :endDate', { endDate });
    return q.orderBy('a.date', 'DESC').getMany();
  }

  // --- Biometrics ---

  async registerFace(employeeId: string, tenantId: string | undefined, faceDescriptor: number[]): Promise<BiometricCredential> {
    tenantId = (await this.empleadoDe(employeeId, tenantId)).tenantId;
    const existing = await this.bioRepo.findOne({ where: { employeeId, type: 'FACE' } });
    const data = { employeeId, tenantId, type: 'FACE', faceDescriptor: JSON.stringify(faceDescriptor), isActive: true };
    if (existing) {
      await this.bioRepo.update(existing.id, data);
      return this.bioRepo.findOne({ where: { id: existing.id } }) as Promise<BiometricCredential>;
    }
    return this.bioRepo.save(this.bioRepo.create(data));
  }

  async verifyFace(faceDescriptor: number[], tenantId?: string): Promise<{ employeeId: string; distance: number } | null> {
    if (!tenantId) return null;
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

  async findBiometricsByTenant(tenantId?: string): Promise<BiometricCredential[]> {
    if (!tenantId) return [];
    return this.bioRepo.find({ where: { tenantId, isActive: true } });
  }
}

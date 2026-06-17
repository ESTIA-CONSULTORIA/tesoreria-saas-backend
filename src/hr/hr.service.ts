import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from './entities/employee.entity';
import { HrDocument } from './entities/hr-document.entity';
import { VacationRequest } from './entities/vacation-request.entity';
import { PermissionRequest } from './entities/permission-request.entity';
import { HrShift } from './entities/hr-shift.entity';
import { Attendance } from './entities/attendance.entity';
import { BiometricCredential } from './entities/biometric-credential.entity';
import { Branch } from '../branches/entities/branch.entity';

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
    @InjectRepository(Branch)
    private readonly branchRepo: Repository<Branch>,
  ) {}

  // --- Employees ---

  findAllEmployees(tenantId?: string, companyId?: string): Promise<Employee[]> {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    if (companyId) where.companyId = companyId;
    return this.empRepo.find({ where, order: { nombre: 'ASC' } });
  }

  async createEmployee(data: Partial<Employee>): Promise<Employee> {
    return this.empRepo.save(this.empRepo.create(data));
  }

  async updateEmployee(id: string, data: Partial<Employee>, tenantId?: string): Promise<Employee> {
    const emp = await this.empRepo.findOne({ where: { id } });
    if (!emp) throw new NotFoundException('Empleado no encontrado');
    if (tenantId && emp.tenantId && emp.tenantId !== tenantId) {
      throw new ForbiddenException('No tienes permiso sobre este empleado');
    }
    await this.empRepo.update(id, data);
    return this.empRepo.findOne({ where: { id } }) as Promise<Employee>;
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

  findDocsByEmployee(employeeId: string, tenantId?: string): Promise<HrDocument[]> {
    return this.docRepo.find({ where: { employeeId }, order: { uploadedAt: 'DESC' } });
  }

  async addDocument(employeeId: string, data: Partial<HrDocument>): Promise<HrDocument> {
    return this.docRepo.save(this.docRepo.create({ ...data, employeeId }));
  }

  async removeDocument(id: string): Promise<void> {
    await this.docRepo.delete(id);
  }

  // --- Portal: get employee by userId ---

  async findEmployeeByUserId(userId: string): Promise<Employee | null> {
    return this.empRepo.findOne({ where: { userId } });
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
    await this.vacRepo.update(id, { status: 'APROBADA', approvedBy, approvedAt: new Date(), responseNote: responseNote || '' });
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
    await this.permRepo.update(id, { status: 'APROBADA', approvedBy, responseNote: responseNote || '' });
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

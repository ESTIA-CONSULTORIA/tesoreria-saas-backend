import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PosMessage } from './entities/pos-message.entity';
import { Shift } from '../pos/entities/shift.entity';

// Quién puede aprobar o rechazar un corte. El resto del personal del turno solo conversa.
export const ROLES_APRUEBAN_CORTE = ['ADMIN', 'GERENTE', 'SOPORTE'];

@Injectable()
export class PosChatService {
  constructor(
    @InjectRepository(PosMessage)
    private readonly repo: Repository<PosMessage>,
    @InjectRepository(Shift)
    private readonly shiftsRepo: Repository<Shift>,
  ) {}

  // El turno del chat debe ser del tenant de quien llama (antes cualquier usuario leía, escribía y aprobaba el corte de
  // CUALQUIER tenant con solo conocer el id del turno). SOPORTE no tiene tenant y conserva el acceso total.
  // Mismo 404 si no existe o es de otro tenant: no revela de quién es.
  async assertTurnoDelTenant(turnoId: string, tenantId?: string, roleCode?: string): Promise<void> {
    if (roleCode === 'SOPORTE') return;
    const shift = tenantId ? await this.shiftsRepo.findOne({ where: { id: turnoId, tenantId } }) : null;
    if (!shift) throw new NotFoundException('Turno no encontrado');
  }

  async getMessages(turnoId: string, tenantId?: string, roleCode?: string): Promise<PosMessage[]> {
    await this.assertTurnoDelTenant(turnoId, tenantId, roleCode);
    return this.repo.find({
      where: { turnoId },
      order: { createdAt: 'ASC' },
    });
  }

  async sendMessage(
    turnoId: string,
    userId: string,
    userName: string,
    role: string,
    message: string,
    type = 'TEXT',
    tenantId?: string,
  ): Promise<PosMessage> {
    // Un mensaje normal no puede hacerse pasar por una aprobación o un rechazo: esos tipos solo salen de approve/reject.
    if (!['TEXT', 'APPROVAL_REQUEST', 'APPROVAL', 'REJECTION'].includes(type)) type = 'TEXT';
    if ((type === 'APPROVAL' || type === 'REJECTION') && !ROLES_APRUEBAN_CORTE.includes(role)) {
      throw new ForbiddenException('Solo un gerente o administrador puede aprobar o rechazar un corte.');
    }
    await this.assertTurnoDelTenant(turnoId, tenantId, role);
    const msg = this.repo.create({ turnoId, userId, userName, role, message, type });
    return this.repo.save(msg);
  }

  async approve(
    turnoId: string,
    userId: string,
    userName: string,
    role: string,
    comment?: string,
    tenantId?: string,
  ): Promise<PosMessage> {
    return this.sendMessage(turnoId, userId, userName, role, comment || 'Corte aprobado.', 'APPROVAL', tenantId);
  }

  async reject(
    turnoId: string,
    userId: string,
    userName: string,
    role: string,
    comment?: string,
    tenantId?: string,
  ): Promise<PosMessage> {
    return this.sendMessage(turnoId, userId, userName, role, comment || 'Corte rechazado.', 'REJECTION', tenantId);
  }
}

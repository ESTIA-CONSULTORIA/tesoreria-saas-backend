import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PosMessage } from './entities/pos-message.entity';

@Injectable()
export class PosChatService {
  constructor(
    @InjectRepository(PosMessage)
    private readonly repo: Repository<PosMessage>,
  ) {}

  async getMessages(turnoId: string): Promise<PosMessage[]> {
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
  ): Promise<PosMessage> {
    const msg = this.repo.create({ turnoId, userId, userName, role, message, type });
    return this.repo.save(msg);
  }

  async approve(
    turnoId: string,
    userId: string,
    userName: string,
    role: string,
    comment?: string,
  ): Promise<PosMessage> {
    return this.sendMessage(
      turnoId,
      userId,
      userName,
      role,
      comment || 'Corte aprobado.',
      'APPROVAL',
    );
  }

  async reject(
    turnoId: string,
    userId: string,
    userName: string,
    role: string,
    comment?: string,
  ): Promise<PosMessage> {
    return this.sendMessage(
      turnoId,
      userId,
      userName,
      role,
      comment || 'Corte rechazado.',
      'REJECTION',
    );
  }
}

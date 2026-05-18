import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Plan } from './entities/plan.entity';

@Injectable()
export class PlansService {
  constructor(
    @InjectRepository(Plan)
    private plansRepository: Repository<Plan>,
  ) {}

  async create(data: Partial<Plan>) {
    const code = String(data.code || '')
      .trim()
      .toUpperCase();

    if (!code) {
      throw new BadRequestException(
        'Código de plan requerido',
      );
    }

    const existingPlan = await this.plansRepository.findOne({
      where: {
        code,
      },
    });

    if (existingPlan) {
      throw new BadRequestException(
        'Ya existe un plan con ese código',
      );
    }

    const plan = this.plansRepository.create({
      ...data,
      code,
      isActive:
        data.isActive !== undefined
          ? Boolean(data.isActive)
          : true,
    });

    return this.plansRepository.save(plan);
  }

  findAll() {
    return this.plansRepository.find({
      order: {
        createdAt: 'DESC',
      },
    });
  }

  findByCode(code: string) {
    return this.plansRepository.findOne({
      where: {
        code: String(code || '')
          .trim()
          .toUpperCase(),
      },
    });
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Plan } from './entities/plan.entity';
import { Repository } from 'typeorm';

@Injectable()
export class PlansService {
  constructor(
    @InjectRepository(Plan)
    private plansRepository: Repository<Plan>,
  ) {}

  create(data: Partial<Plan>) {
    const plan = this.plansRepository.create(data);
    return this.plansRepository.save(plan);
  }

  findAll() {
    return this.plansRepository.find();
  }

  findByCode(code: string) {
    return this.plansRepository.findOne({ where: { code } });
  }
}
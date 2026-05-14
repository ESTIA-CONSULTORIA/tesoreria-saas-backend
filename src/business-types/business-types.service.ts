import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BusinessType } from './entities/business-type.entity';
import { Repository } from 'typeorm';

@Injectable()
export class BusinessTypesService {
  constructor(
    @InjectRepository(BusinessType)
    private businessTypesRepository: Repository<BusinessType>,
  ) {}

  create(data: Partial<BusinessType>) {
    const businessType = this.businessTypesRepository.create(data);
    return this.businessTypesRepository.save(businessType);
  }

  findAll() {
    return this.businessTypesRepository.find();
  }

  findByCode(code: string) {
    return this.businessTypesRepository.findOne({ where: { code } });
  }
}
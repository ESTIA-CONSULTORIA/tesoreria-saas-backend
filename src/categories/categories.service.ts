import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Category } from './entities/category.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
  ) {}

  async create(code: string, name: string, type: string) {
    const normalizedCode = code.trim().toUpperCase();
    const normalizedType = type.trim().toUpperCase();

    const existingCategory = await this.categoriesRepository.findOne({
      where: {
        code: normalizedCode,
      },
    });

    if (existingCategory) {
      throw new BadRequestException(
        'Ya existe una categoría con ese código',
      );
    }

    const category = this.categoriesRepository.create({
      code: normalizedCode,
      name: name.trim(),
      type: normalizedType,
      isActive: true,
    });

    return this.categoriesRepository.save(category);
  }

  findAll() {
    return this.categoriesRepository.find({
      order: {
        code: 'ASC',
      },
    });
  }
}

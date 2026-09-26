import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BusinessTypesService } from './business-types.service';
import { BusinessType } from './entities/business-type.entity';

describe('BusinessTypesService', () => {
  let service: BusinessTypesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BusinessTypesService, { provide: getRepositoryToken(BusinessType), useValue: {} }],
    }).compile();

    service = module.get<BusinessTypesService>(BusinessTypesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

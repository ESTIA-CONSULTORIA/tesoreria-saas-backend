import { Test, TestingModule } from '@nestjs/testing';
import { BusinessTypesService } from './business-types.service';

describe('BusinessTypesService', () => {
  let service: BusinessTypesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BusinessTypesService],
    }).compile();

    service = module.get<BusinessTypesService>(BusinessTypesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { BusinessTypesController } from './business-types.controller';

describe('BusinessTypesController', () => {
  let controller: BusinessTypesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BusinessTypesController],
    }).compile();

    controller = module.get<BusinessTypesController>(BusinessTypesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

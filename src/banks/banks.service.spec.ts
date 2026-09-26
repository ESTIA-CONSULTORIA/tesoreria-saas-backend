import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BanksService } from './banks.service';
import { Bank } from './entities/bank.entity';

describe('BanksService', () => {
  let service: BanksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BanksService,
        { provide: getRepositoryToken(Bank), useValue: {} },
        { provide: DataSource, useValue: {} },
      ],
    }).compile();

    service = module.get<BanksService>(BanksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AccountsService } from './accounts.service';
import { Account } from './entities/account.entity';

// Diagnóstico (ronda de seguimiento, auditoría BUSINESS): boilerplate de `nest generate` sin
// llenar — declaraba solo el service, sin el repositorio que su constructor inyecta
// (@InjectRepository(Account)), así que compile() nunca lograba resolver la dependencia.
describe('AccountsService', () => {
  let service: AccountsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AccountsService, { provide: getRepositoryToken(Account), useValue: {} }],
    }).compile();

    service = module.get<AccountsService>(AccountsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

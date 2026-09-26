import { Test, TestingModule } from '@nestjs/testing';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

// Diagnóstico (ronda de seguimiento, auditoría BUSINESS): boilerplate de `nest generate` sin
// llenar — declaraba solo el controller, sin su dependencia real (AccountsService), así que
// Test.createTestingModule().compile() nunca lograba resolver el constructor y fallaba antes
// de llegar a ningún test (mismo defecto en las otras 35 suites de esta ronda). Se agrega el
// provider mockeado; el test en sí sigue siendo el smoke test original ("should be defined").
describe('AccountsController', () => {
  let controller: AccountsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountsController],
      providers: [{ provide: AccountsService, useValue: {} }],
    }).compile();

    controller = module.get<AccountsController>(AccountsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TreasuryController } from './treasury.controller';
import { TreasuryService } from './treasury.service';

// Auditoría BUSINESS (recomendación #3, seguimiento): GET/POST /treasury/transfers se
// retiraron del controller (duplicaban y desincronizaban TransfersService — ver comentario en
// treasury.controller.ts, junto a donde vivían estas rutas). Esta prueba deja constancia de
// que la ruta vieja de verdad desapareció de la superficie HTTP y no solo del código fuente
// que alguien podría no leer — un supertest real contra un Nest app, no una lectura de
// metadata de rutas.
describe('TreasuryController — rutas /treasury/transfers retiradas', () => {
  let app: INestApplication;
  let treasuryService: { getExecutiveSummary: jest.Mock };

  beforeEach(async () => {
    treasuryService = {
      getExecutiveSummary: jest.fn().mockResolvedValue({ ok: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TreasuryController],
      providers: [{ provide: TreasuryService, useValue: treasuryService }],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /treasury/transfers ya no existe (404)', async () => {
    await request(app.getHttpServer()).get('/treasury/transfers').expect(404);
  });

  it('POST /treasury/transfers ya no existe (404)', async () => {
    await request(app.getHttpServer())
      .post('/treasury/transfers')
      .send({ cuentaOrigenId: 'a', cuentaDestinoId: 'b', monto: 100 })
      .expect(404);
  });

  it('control: el resto del controller de treasury sigue montado y respondiendo', async () => {
    await request(app.getHttpServer()).get('/treasury/executive-summary').expect(200);
    expect(treasuryService.getExecutiveSummary).toHaveBeenCalled();
  });
});

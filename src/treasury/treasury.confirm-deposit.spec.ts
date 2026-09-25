import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TreasuryService } from './treasury.service';
import { Bank } from '../banks/entities/bank.entity';
import { Movement } from '../movements/entities/movement.entity';
import { PaymentSchedule } from './entities/payment-schedule.entity';
import { Purchase } from '../purchases/entities/purchase.entity';
import { Shift } from '../pos/entities/shift.entity';
import { Transfer } from '../transfers/entities/transfer.entity';

// Auditoría BUSINESS (recomendación #4 de la lista de seguimiento): confirmDeposit() usaba
// nombres de columna que no existen en la entidad real Movement (bankId/tipo/monto/
// descripcion/fecha en vez de accountId/type/amount/concept/date), forzado con `as any` para
// saltarse el chequeo de TypeScript. El depósito de cierre de turno de POS nunca quedaba
// realmente registrado como movimiento bancario utilizable, y el saldo de la cuenta nunca se
// actualizaba (ni siquiera con los nombres correctos lo hacía antes).
describe('TreasuryService.confirmDeposit()', () => {
  let service: TreasuryService;
  let movementsRepo: { create: jest.Mock; save: jest.Mock };
  let banksRepo: { findOne: jest.Mock; save: jest.Mock };
  let shiftsRepo: { findOne: jest.Mock; update: jest.Mock };

  const SHIFT_ID = 'shift-1';
  const BANK_ID = 'bank-1';
  const AMOUNT = 1500;

  beforeEach(async () => {
    movementsRepo = {
      create: jest.fn((data) => data),
      save: jest.fn((data) => Promise.resolve({ id: 'mov-new', ...data })),
    };
    banksRepo = {
      findOne: jest.fn().mockResolvedValue({ id: BANK_ID, balance: 1000 }),
      save: jest.fn((data) => Promise.resolve(data)),
    };
    shiftsRepo = {
      findOne: jest.fn().mockResolvedValue({ id: SHIFT_ID, cajero: 'Juan', fecha: '2026-09-22' }),
      update: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TreasuryService,
        { provide: getRepositoryToken(Bank), useValue: banksRepo },
        { provide: getRepositoryToken(Movement), useValue: movementsRepo },
        { provide: getRepositoryToken(PaymentSchedule), useValue: {} },
        { provide: getRepositoryToken(Purchase), useValue: {} },
        { provide: getRepositoryToken(Shift), useValue: shiftsRepo },
        { provide: getRepositoryToken(Transfer), useValue: {} },
      ],
    }).compile();

    service = module.get<TreasuryService>(TreasuryService);
  });

  it('crea el Movement con las columnas reales de la entidad (accountId/type/amount/concept/date)', async () => {
    await service.confirmDeposit(SHIFT_ID, 'tenant-A', BANK_ID, AMOUNT);

    expect(movementsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: BANK_ID,
        type: 'INCOME',
        amount: AMOUNT,
        status: 'APPROVED',
      }),
    );
    const createdArg = movementsRepo.create.mock.calls[0][0];
    expect(createdArg.concept).toEqual(expect.any(String));
    expect(createdArg.date).toBeInstanceOf(Date);
    // Nombres viejos (rotos) no deben aparecer en absoluto.
    expect(createdArg).not.toHaveProperty('bankId');
    expect(createdArg).not.toHaveProperty('tipo');
    expect(createdArg).not.toHaveProperty('monto');
    expect(createdArg).not.toHaveProperty('descripcion');
    expect(createdArg).not.toHaveProperty('fecha');
  });

  it('actualiza el balance real de la cuenta bancaria (antes no la tocaba en absoluto)', async () => {
    await service.confirmDeposit(SHIFT_ID, 'tenant-A', BANK_ID, AMOUNT);

    expect(banksRepo.findOne).toHaveBeenCalledWith({ where: { id: BANK_ID } });
    expect(banksRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: BANK_ID, balance: 1000 + AMOUNT }));
  });

  it('marca totalDepositos en el turno y devuelve el id del movimiento creado', async () => {
    const result = await service.confirmDeposit(SHIFT_ID, 'tenant-A', BANK_ID, AMOUNT);

    expect(shiftsRepo.update).toHaveBeenCalledWith(SHIFT_ID, { totalDepositos: AMOUNT });
    expect(result).toEqual({ success: true, movementId: 'mov-new' });
  });

  it('falla con un mensaje claro si la cuenta bancaria no existe', async () => {
    banksRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.confirmDeposit(SHIFT_ID, 'tenant-A', 'bank-inexistente', AMOUNT)).rejects.toThrow();
    expect(movementsRepo.save).not.toHaveBeenCalled();
  });
});

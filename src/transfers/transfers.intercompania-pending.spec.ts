import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TransfersService } from './transfers.service';
import { Transfer } from './entities/transfer.entity';
import { Bank } from '../banks/entities/bank.entity';

// Auditoría BUSINESS (recomendación #3, seguimiento): antes, treasury.service.ts::
// createTransfer() ignoraba por completo el campo `tipo` que mandaba el formulario de
// TreasuryPage.tsx — un "Traslado Intercompañía" se ejecutaba de inmediato, exactamente igual
// que uno interno, saltándose el flujo de autorización real (placebo: el selector existía en
// la UI pero no tenía ningún efecto). Con /treasury/transfers retirado, TransfersService.
// create() es ahora la única vía para crear traslados. Esta prueba cierra el hueco de verdad:
// una INTERCOMPAÑIA debe quedar PENDIENTE, sin mover saldos ni crear movimientos, hasta que
// alguien la autorice explícitamente vía authorize().
describe('TransfersService.create() — INTERCOMPAÑIA queda pendiente de autorización', () => {
  let service: TransfersService;
  let transferRepo: { create: jest.Mock; save: jest.Mock };
  let banksRepo: { findOne: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  const TENANT_ID = 'tenant-A';
  const FROM_ACCOUNT = 'bank-1';
  const TO_ACCOUNT = 'bank-2';

  beforeEach(async () => {
    transferRepo = {
      create: jest.fn((data) => data),
      save: jest.fn((data) => Promise.resolve({ id: 'transfer-new', ...data })),
    };
    banksRepo = {
      // assertAccountsBelongToTenant solo exige que ambas cuentas resuelvan a algo (no-null);
      // el mismo objeto sirve para ambas llamadas (origen/destino).
      findOne: jest.fn().mockResolvedValue({ id: FROM_ACCOUNT, tenantId: TENANT_ID, balance: 1000 }),
    };
    dataSource = {
      transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransfersService,
        { provide: getRepositoryToken(Transfer), useValue: transferRepo },
        { provide: getRepositoryToken(Bank), useValue: banksRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<TransfersService>(TransfersService);
  });

  it('crea la transferencia con status PENDIENTE (no AUTORIZADA)', async () => {
    const result = await service.create(
      FROM_ACCOUNT,
      TO_ACCOUNT,
      500,
      'Pago entre empresas',
      'INTERCOMPAÑIA',
      'empresa-1',
      'empresa-2',
      undefined,
      undefined,
      TENANT_ID,
    );

    expect(transferRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PENDIENTE', tipo: 'INTERCOMPAÑIA' }),
    );
    expect(result).toEqual(expect.objectContaining({ status: 'PENDIENTE' }));
  });

  it('NO ejecuta ningún movimiento de saldo al crearse — dataSource.transaction jamás se invoca', async () => {
    await service.create(
      FROM_ACCOUNT,
      TO_ACCOUNT,
      500,
      'Pago entre empresas',
      'INTERCOMPAÑIA',
      'empresa-1',
      'empresa-2',
      undefined,
      undefined,
      TENANT_ID,
    );

    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('control: una transferencia INTERNA sí se ejecuta de inmediato (AUTORIZADA + movimientos vía transacción)', async () => {
    const fromAccount = { id: FROM_ACCOUNT, balance: 1000 };
    const toAccount = { id: TO_ACCOUNT, balance: 200 };
    const manager = {
      findOne: jest.fn().mockResolvedValueOnce(fromAccount).mockResolvedValueOnce(toAccount),
      save: jest.fn((entity) => Promise.resolve(entity)),
      create: jest.fn((_entity, data) => data),
    };
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    const result = await service.create(
      FROM_ACCOUNT,
      TO_ACCOUNT,
      300,
      'Traslado interno',
      'INTERNA',
      undefined,
      undefined,
      undefined,
      undefined,
      TENANT_ID,
    );

    expect(dataSource.transaction).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ status: 'AUTORIZADA', tipo: 'INTERNA' }));
  });

  // Regresión encontrada en el smoke test manual del punto 3: a diferencia de la rama
  // INTERCOMPAÑIA, la rama INTERNA nunca guardaba tenantId en el registro Transfer — el
  // traslado sí movía el balance real, pero findAll(tenantId) (lo que lee tanto
  // TransfersPage.tsx como el tab Traslados de TreasuryPage.tsx) jamás lo encontraba: el
  // "placebo" reaparecía en un archivo distinto al que treasury.service.ts::createTransfer()
  // tenía. Ver también src/treasury/treasury.transfers-route-removed.spec.ts.
  it('guarda tenantId en el registro Transfer de una INTERNA (si no, findAll(tenantId) jamás la encuentra)', async () => {
    const fromAccount = { id: FROM_ACCOUNT, balance: 1000 };
    const toAccount = { id: TO_ACCOUNT, balance: 200 };
    const manager = {
      findOne: jest.fn().mockResolvedValueOnce(fromAccount).mockResolvedValueOnce(toAccount),
      save: jest.fn((entity) => Promise.resolve(entity)),
      create: jest.fn((_entity, data) => data),
    };
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    await service.create(
      FROM_ACCOUNT,
      TO_ACCOUNT,
      300,
      'Traslado interno',
      'INTERNA',
      undefined,
      undefined,
      undefined,
      undefined,
      TENANT_ID,
    );

    const transferCreateCall = manager.create.mock.calls.find(([entity]) => entity === Transfer);
    expect(transferCreateCall?.[1]).toEqual(expect.objectContaining({ tenantId: TENANT_ID }));
  });
});

import { BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';

// Plan PRUEBA (prueba pública): máximo 5 usuarios por tenant; el plan LITE conserva su tope de 3 y otros planes no tienen tope aquí.
function servicio(plan: string, usuarios: number) {
  const usersRepo: any = {
    count: jest.fn(async () => usuarios),
    create: jest.fn((d: any) => d),
    save: jest.fn(async (d: any) => ({ id: 'u', ...d })),
    findOne: jest.fn(async () => null),
  };
  const tenantRepo: any = { findOne: jest.fn(async () => ({ id: 'T', plan })) };
  return new UsersService(usersRepo, tenantRepo);
}
const crear = (s: UsersService) => s.create('nuevo@x.com', 'Clave12345', 'Nuevo', undefined, 'ADMIN', 'T');

describe('tope de usuarios por plan', () => {
  it('PRUEBA: con 4 usuarios deja crear el 5.º; con 5 rechaza el 6.º', async () => {
    await expect(crear(servicio('PRUEBA', 4))).resolves.toBeDefined();
    await expect(crear(servicio('PRUEBA', 5))).rejects.toThrow(BadRequestException);
    await expect(crear(servicio('PRUEBA', 5))).rejects.toThrow(/máximo 5 usuarios/);
  });
  it('LITE sigue en 3 y un plan de pago no tiene este tope', async () => {
    await expect(crear(servicio('LITE_POS', 3))).rejects.toThrow(/máximo 3/);
    await expect(crear(servicio('BUSINESS', 40))).resolves.toBeDefined();
  });
});

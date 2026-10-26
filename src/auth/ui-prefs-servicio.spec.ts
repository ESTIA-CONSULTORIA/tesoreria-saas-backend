import { AuthService } from './auth.service';

// El id del usuario sale de la sesión: guardar la preferencia propia no puede tocar a otro usuario.
describe('AuthService.guardarUiPrefs', () => {
  const crear = () => {
    const usersRepo = { update: jest.fn().mockResolvedValue({}) };
    const svc = new (AuthService as any)(null, null, null, null, null, null, null, null, null, null);
    (svc as any).usersRepo = usersRepo;
    return { svc: svc as AuthService, usersRepo };
  };

  it('actualiza solo al usuario de la sesión, con el objeto validado', async () => {
    const { svc, usersRepo } = crear();
    const r = await svc.guardarUiPrefs('u1', 'CAJERO', { skin: 'oscuro', userId: 'otro' });
    expect(usersRepo.update).toHaveBeenCalledTimes(1);
    expect(usersRepo.update).toHaveBeenCalledWith({ id: 'u1' }, { uiPrefs: { skin: 'oscuro' } });
    expect(r).toEqual({ uiPrefs: { skin: 'oscuro' } });
  });

  it('un rol sin permiso no escribe nada', async () => {
    const { svc, usersRepo } = crear();
    await expect(svc.guardarUiPrefs('u1', 'CAJERO', { skin: 'claro' })).rejects.toThrow();
    expect(usersRepo.update).not.toHaveBeenCalled();
  });
});
